import type { WebClient } from "@slack/web-api";
import {
  and,
  asc,
  db,
  desc,
  drillEvents,
  drillInjects,
  drillObjectives,
  drills,
  eq,
  inArray,
  users,
  type Drill,
} from "@drillforce/db";
import { resolveInjectEffect, type InjectType } from "@drillforce/shared";
import { env } from "./env";
import { logEvent } from "./events";
import { buildSystemPrompt, generateIcLine, type IcTask, type TranscriptLine } from "./ic-bot";

export interface SlackLink {
  channelId: string;
  channelName: string;
}

interface PendingInject {
  id: string;
  triggerAtMinutes: number;
  description: string;
  injectType: string;
  payload: Record<string, unknown>;
}

interface Session {
  drillId: string;
  channelId: string;
  channelName: string;
  startedAt: Date | null;
  system: string;
  scenarioInjects: string[];
  /** Timed injects (from drill_injects) that haven't fired yet, by trigger time. */
  pendingInjects: PendingInject[];
  lastActivityAt: number;
  nextNudgeAfterMs: number;
  busy: boolean;
  /** Timestamps of messages the bot posted, to recognise thread replies to the IC. */
  botMessageTs: Set<string>;
}

const randomQuietDelay = () =>
  env.quietMinMs + Math.random() * Math.max(0, env.quietMaxMs - env.quietMinMs);

/** Keeps track of drills running in Slack channels and drives the IC bot. */
export class DrillSessionManager {
  private sessions = new Map<string, Session>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private client: WebClient) {}

  /** Re-attach to drills that were active when the bot last stopped. */
  async restore() {
    const active = await db.select().from(drills).where(eq(drills.status, "active"));
    for (const drill of active) {
      const slack = drill.config.slack as SlackLink | undefined;
      if (slack?.channelId) await this.attach(drill, slack);
    }
    if (this.sessions.size) console.log(`↩️  Resumed ${this.sessions.size} active drill(s).`);
  }

  async attach(drill: Drill, slack: SlackLink) {
    const objectives = await db
      .select()
      .from(drillObjectives)
      .where(eq(drillObjectives.drillId, drill.id))
      .orderBy(asc(drillObjectives.sortOrder));

    // Injects already posted (by the bot or a facilitator) aren't offered again.
    const posted = await db
      .select({ payload: drillEvents.payload })
      .from(drillEvents)
      .where(and(eq(drillEvents.drillId, drill.id), eq(drillEvents.eventType, "inject")));
    const postedText = new Set(posted.map((p) => String(p.payload.text ?? "")));

    // Timed injects from drill_injects (the scheduled, service-targeting ones) that
    // haven't fired yet — the bot fires these automatically at their trigger time.
    const timed = await db
      .select()
      .from(drillInjects)
      .where(and(eq(drillInjects.drillId, drill.id), eq(drillInjects.fired, false)))
      .orderBy(asc(drillInjects.triggerAtMinutes), asc(drillInjects.sortOrder));

    this.sessions.set(slack.channelId, {
      drillId: drill.id,
      channelId: slack.channelId,
      channelName: slack.channelName,
      startedAt: drill.startedAt,
      system: buildSystemPrompt(drill, objectives),
      scenarioInjects: (drill.scenario?.injects ?? [])
        .map((i) => i.description)
        .filter((d) => !postedText.has(d)),
      pendingInjects: timed.map((i) => ({
        id: i.id,
        triggerAtMinutes: i.triggerAtMinutes,
        description: i.description,
        injectType: i.injectType,
        payload: i.payload ?? {},
      })),
      lastActivityAt: Date.now(),
      nextNudgeAfterMs: randomQuietDelay(),
      busy: false,
      botMessageTs: new Set(),
    });
  }

  detach(channelId: string) {
    this.sessions.delete(channelId);
  }

  get(channelId: string) {
    return this.sessions.get(channelId);
  }

  findByDrill(drillId: string) {
    return [...this.sessions.values()].find((s) => s.drillId === drillId);
  }

  touch(channelId: string) {
    const s = this.sessions.get(channelId);
    if (s) {
      s.lastActivityAt = Date.now();
      s.nextNudgeAfterMs = randomQuietDelay();
    }
  }

  markInjectUsed(channelId: string, text: string) {
    const s = this.sessions.get(channelId);
    if (s) s.scenarioInjects = s.scenarioInjects.filter((i) => i !== text);
  }

  isReplyToBot(channelId: string, threadTs?: string) {
    return !!threadTs && !!this.sessions.get(channelId)?.botMessageTs.has(threadTs);
  }

  start() {
    this.timer = setInterval(() => void this.tick(), 15_000);
  }

  private async tick() {
    for (const s of this.sessions.values()) await this.checkTimedInjects(s);
    await this.checkQuietChannels();
  }

  /** Fire any scheduled injects whose trigger time has passed. */
  private async checkTimedInjects(s: Session) {
    if (!s.startedAt || s.pendingInjects.length === 0) return;
    const elapsedMin = (Date.now() - s.startedAt.getTime()) / 60000;
    const due = s.pendingInjects.filter((i) => i.triggerAtMinutes <= elapsedMin);
    if (!due.length) return;
    // Remove synchronously so an overlapping tick can't double-fire.
    s.pendingInjects = s.pendingInjects.filter((i) => i.triggerAtMinutes > elapsedMin);
    for (const inj of due) await this.fireTimedInject(s, inj);
  }

  private async fireTimedInject(s: Session, inj: PendingInject) {
    const effect = resolveInjectEffect(inj.injectType as InjectType, inj.payload);
    const impact =
      effect.kind === "comms"
        ? ""
        : effect.services.length
          ? ` _(impacts ${effect.services.join(", ")})_`
          : "";
    try {
      await db.update(drillInjects).set({ fired: true, firedAt: new Date() }).where(eq(drillInjects.id, inj.id));
      await this.post(s.channelId, `${inj.description}${impact}`, { asInject: true });
    } catch (err) {
      console.error("Could not fire timed inject:", err);
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Posts as the IC bot and records the event. */
  async post(channelId: string, text: string, opts: { asInject?: boolean; threadTs?: string } = {}) {
    const s = this.sessions.get(channelId);
    const message = opts.asInject ? `⚠️ *INJECT:* ${text}` : text;
    const res = await this.client.chat.postMessage({ channel: channelId, text: message, thread_ts: opts.threadTs });
    if (s && res.ts) s.botMessageTs.add(res.ts);
    if (s) {
      await logEvent({
        drillId: s.drillId,
        eventType: opts.asInject ? "inject" : "message",
        actor: "bot",
        channel: `#${s.channelName}`,
        payload: { text, ts: res.ts, ...(opts.threadTs ? { thread_ts: opts.threadTs } : {}) },
      });
      if (opts.asInject) this.markInjectUsed(channelId, text);
    }
    this.touch(channelId);
  }

  /** IC replies in-character to a direct question. */
  async reply(channelId: string, from: string, question: string, threadTs: string) {
    await this.runIc(channelId, { kind: "reply", from, question }, threadTs);
  }

  private async checkQuietChannels() {
    const now = Date.now();
    for (const s of this.sessions.values()) {
      if (s.busy || now - s.lastActivityAt < s.nextNudgeAfterMs) continue;
      const quietMinutes = Math.round((now - s.lastActivityAt) / 60000);
      await this.runIc(s.channelId, { kind: "nudge", quietMinutes, unusedInjects: s.scenarioInjects });
    }
  }

  private async runIc(channelId: string, task: IcTask, threadTs?: string) {
    const s = this.sessions.get(channelId);
    if (!s || s.busy) return;
    s.busy = true;
    try {
      const transcript = await this.transcript(s.drillId);
      const line = await generateIcLine({ system: s.system, transcript, startedAt: s.startedAt, task });
      await this.post(channelId, line.text, { asInject: line.isInject, threadTs });
    } catch (err) {
      console.error("IC bot could not post:", err);
      this.touch(channelId);
    } finally {
      s.busy = false;
    }
  }

  /** Last 40 channel messages/injects, oldest first, with readable names. */
  private async transcript(drillId: string): Promise<TranscriptLine[]> {
    const rows = await db
      .select()
      .from(drillEvents)
      .where(and(eq(drillEvents.drillId, drillId), inArray(drillEvents.eventType, ["message", "inject"])))
      .orderBy(desc(drillEvents.occurredAt))
      .limit(40);
    rows.reverse();

    const userIds = [...new Set(rows.map((r) => r.actor).filter((a): a is string => !!a && /^[0-9a-f-]{36}$/.test(a)))];
    const names = new Map<string, string>();
    if (userIds.length) {
      for (const u of await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))) {
        names.set(u.id, u.name);
      }
    }

    return rows.map((r) => ({
      at: r.occurredAt,
      who:
        r.actor === "bot"
          ? "IC (you)"
          : (names.get(r.actor ?? "") ?? String(r.payload.user_name ?? r.actor ?? "unknown")),
      kind: r.eventType === "inject" ? "inject" : r.actor === "bot" ? "bot" : "message",
      text: String(r.payload.text ?? ""),
    }));
  }
}
