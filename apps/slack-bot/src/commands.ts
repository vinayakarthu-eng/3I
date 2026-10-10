import type { WebClient } from "@slack/web-api";
import {
  asc,
  count,
  db,
  drillEvents,
  drillObjectives,
  drillParticipants,
  drills,
  eq,
  sql,
  users,
  type Drill,
} from "@drillforce/db";
import {
  CRITERIA_TYPE_LABELS,
  DRILL_STATUS_LABELS,
  DRILL_TYPE_LABELS,
  PARTICIPANT_ROLE_LABELS,
} from "@drillforce/shared";
import type { DrillSessionManager } from "./drill-session";
import { env } from "./env";
import { logEvent } from "./events";
import { resolveSlackUser, slackIdForEmail } from "./users";

export interface CommandContext {
  client: WebClient;
  sessions: DrillSessionManager;
  channelId: string;
  userId: string;
  /** Sends an ephemeral reply to the person who ran the command. */
  respond: (text: string) => Promise<unknown>;
}

export const HELP_TEXT = [
  "*DrillForce commands*",
  "• `/drillforce start <drill-id>` – open a drill channel, brief participants, and start the IC bot",
  "• `/drillforce status` – elapsed time and objectives (run inside a drill channel)",
  "• `/drillforce inject <description>` – post a scenario inject",
  "• `/drillforce end` – end the drill and hand it off for scoring",
].join("\n");

export async function handleCommand(text: string, ctx: CommandContext) {
  const [sub = "help", ...rest] = text.trim().split(/\s+/);
  const arg = rest.join(" ").trim();
  switch (sub.toLowerCase()) {
    case "start":
      return startDrill(arg, ctx);
    case "status":
      return drillStatus(arg, ctx);
    case "inject":
      return postInject(arg, ctx);
    case "end":
      return endDrill(ctx);
    default:
      return ctx.respond(HELP_TEXT);
  }
}

/** Accepts a full UUID or a unique prefix of at least 6 characters. */
async function findDrill(idOrPrefix: string): Promise<Drill | "ambiguous" | null> {
  const id = idOrPrefix.toLowerCase();
  if (!/^[0-9a-f-]{6,36}$/.test(id)) return null;
  const rows = await db
    .select()
    .from(drills)
    .where(sql`${drills.id}::text like ${id + "%"}`)
    .limit(2);
  if (rows.length > 1) return "ambiguous";
  return rows[0] ?? null;
}

function channelNameFor(drill: Drill) {
  const slug = drill.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  const date = new Date().toISOString().slice(0, 10);
  return `drill-${slug}-${date}`;
}

async function createChannel(client: WebClient, base: string) {
  for (let attempt = 1; attempt <= 10; attempt++) {
    const name = attempt === 1 ? base : `${base}-${attempt}`;
    try {
      const res = await client.conversations.create({ name: name.slice(0, 80) });
      if (res.channel?.id) return { id: res.channel.id, name: res.channel.name ?? name };
    } catch (err) {
      const code = (err as { data?: { error?: string } }).data?.error;
      if (code !== "name_taken") throw err;
    }
  }
  throw new Error("Could not find a free channel name.");
}

function formatElapsed(from: Date | null) {
  if (!from) return "not started";
  const mins = Math.floor((Date.now() - from.getTime()) / 60000);
  const h = Math.floor(mins / 60);
  return h ? `${h}h ${mins % 60}m` : `${mins}m`;
}

// ─── start ──────────────────────────────────────────────────────────────────

async function startDrill(arg: string, ctx: CommandContext) {
  if (!arg) return ctx.respond("Usage: `/drillforce start <drill-id>` (copy the ID from the drill's URL).");
  const drill = await findDrill(arg);
  if (drill === "ambiguous") return ctx.respond("That ID prefix matches more than one drill. Use more characters.");
  if (!drill) return ctx.respond(`No drill found with ID \`${arg}\`.`);
  if (drill.status !== "scheduled" && drill.status !== "briefing") {
    return ctx.respond(
      `*${drill.name}* is ${DRILL_STATUS_LABELS[drill.status]}. Only Scheduled or Briefing drills can be started.`,
    );
  }

  await ctx.respond(`Starting *${drill.name}*…`);

  const channel = await createChannel(ctx.client, channelNameFor(drill));

  // Invite participants (matched by email) plus whoever started the drill.
  const participants = await db
    .select({ id: drillParticipants.id, role: drillParticipants.role, name: users.name, email: users.email })
    .from(drillParticipants)
    .innerJoin(users, eq(users.id, drillParticipants.userId))
    .where(eq(drillParticipants.drillId, drill.id));

  const slackIds = new Set<string>([ctx.userId]);
  const notInSlack: string[] = [];
  for (const p of participants) {
    const id = await slackIdForEmail(ctx.client, p.email);
    if (id) slackIds.add(id);
    else notInSlack.push(`${p.name} (${p.email})`);
  }
  try {
    await ctx.client.conversations.invite({ channel: channel.id, users: [...slackIds].join(",") });
  } catch (err) {
    console.warn("Some invites failed:", (err as { data?: { error?: string } }).data?.error ?? err);
  }

  const objectives = await db
    .select()
    .from(drillObjectives)
    .where(eq(drillObjectives.drillId, drill.id))
    .orderBy(asc(drillObjectives.sortOrder));

  // Mark the drill active and remember where it runs.
  const startedAt = new Date();
  const [updated] = await db
    .update(drills)
    .set({
      status: "active",
      startedAt,
      config: { ...drill.config, slack: { channelId: channel.id, channelName: channel.name } },
    })
    .where(eq(drills.id, drill.id))
    .returning();

  const starter = await resolveSlackUser(ctx.client, ctx.userId);
  await logEvent({
    drillId: drill.id,
    eventType: "system",
    actor: starter.actor,
    channel: `#${channel.name}`,
    payload: {
      kind: "status_change",
      from: drill.status,
      to: "active",
      text: `Drill started in Slack (#${channel.name}) by ${starter.name}`,
    },
    occurredAt: startedAt,
  });

  await ctx.sessions.attach(updated, { channelId: channel.id, channelName: channel.name });

  const briefing = [
    `:rotating_light: *${drill.name}* — ${DRILL_TYPE_LABELS[drill.type]} exercise`,
    drill.description ? `>${drill.description}` : null,
    drill.scenario?.summary ? `*Scenario:* ${drill.scenario.summary}` : null,
    "",
    "*Objectives*",
    ...objectives.map((o, i) => `${i + 1}. ${o.description} _(${CRITERIA_TYPE_LABELS[o.criteriaType]})_`),
    "",
    "*Roles*",
    ...(participants.length
      ? participants.map((p) => `• ${p.name} — ${PARTICIPANT_ROLE_LABELS[p.role]}`)
      : ["• No participants assigned"]),
    "",
    "*This drill is now ACTIVE. All actions in this channel are being recorded.*",
    `Drill details: ${env.webAppUrl}/drills/${drill.id}`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  await ctx.client.chat.postMessage({ channel: channel.id, text: briefing });
  await logEvent({
    drillId: drill.id,
    eventType: "system",
    actor: "bot",
    channel: `#${channel.name}`,
    payload: { text: "Briefing posted; IC bot is live" },
  });

  const missing = notInSlack.length
    ? `\nCouldn't find these participants in Slack (invite them manually): ${notInSlack.join(", ")}`
    : "";
  return ctx.respond(`*${drill.name}* is live in <#${channel.id}>.${missing}`);
}

// ─── status ─────────────────────────────────────────────────────────────────

async function drillStatus(arg: string, ctx: CommandContext) {
  const session = ctx.sessions.get(ctx.channelId);
  let drill: Drill | null = null;
  if (session) {
    [drill] = await db.select().from(drills).where(eq(drills.id, session.drillId));
  } else if (arg) {
    const found = await findDrill(arg);
    drill = found === "ambiguous" ? null : found;
  }
  if (!drill) {
    return ctx.respond("Run `/drillforce status` inside a drill channel, or pass a drill ID.");
  }

  const objectives = await db
    .select()
    .from(drillObjectives)
    .where(eq(drillObjectives.drillId, drill.id))
    .orderBy(asc(drillObjectives.sortOrder));
  const [{ value: eventCount }] = await db
    .select({ value: count() })
    .from(drillEvents)
    .where(eq(drillEvents.drillId, drill.id));

  return ctx.respond(
    [
      `*${drill.name}* — ${DRILL_STATUS_LABELS[drill.status]}`,
      `Elapsed: *${formatElapsed(drill.startedAt)}* · Events recorded: *${eventCount}*`,
      "",
      "*Objectives*",
      ...objectives.map((o) => `☐ ${o.description} _(${CRITERIA_TYPE_LABELS[o.criteriaType]})_`),
    ].join("\n"),
  );
}

// ─── inject ─────────────────────────────────────────────────────────────────

async function postInject(arg: string, ctx: CommandContext) {
  const session = ctx.sessions.get(ctx.channelId);
  if (!session) return ctx.respond("Run `/drillforce inject` inside an active drill channel.");
  if (!arg) return ctx.respond("Usage: `/drillforce inject <description>`");
  await ctx.sessions.post(ctx.channelId, arg, { asInject: true });
  return ctx.respond("Inject posted.");
}

// ─── end ────────────────────────────────────────────────────────────────────

async function endDrill(ctx: CommandContext) {
  const session = ctx.sessions.get(ctx.channelId);
  if (!session) return ctx.respond("Run `/drillforce end` inside an active drill channel.");

  const [drill] = await db.select().from(drills).where(eq(drills.id, session.drillId));
  if (!drill || drill.status !== "active") {
    ctx.sessions.detach(ctx.channelId);
    return ctx.respond("This drill is no longer active.");
  }

  const endedAt = new Date();
  const ender = await resolveSlackUser(ctx.client, ctx.userId);
  await db.update(drills).set({ status: "scoring", endedAt }).where(eq(drills.id, drill.id));
  await logEvent({
    drillId: drill.id,
    eventType: "system",
    actor: ender.actor,
    channel: `#${session.channelName}`,
    payload: { kind: "status_change", from: "active", to: "scoring", text: `Drill ended in Slack by ${ender.name}` },
    occurredAt: endedAt,
  });
  ctx.sessions.detach(ctx.channelId);

  const byType = await db
    .select({ type: drillEvents.eventType, value: count() })
    .from(drillEvents)
    .where(eq(drillEvents.drillId, drill.id))
    .groupBy(drillEvents.eventType);
  const total = byType.reduce((a, r) => a + r.value, 0);
  const breakdown = byType.map((r) => `${r.value} ${r.type}`).join(", ");

  await ctx.client.chat.postMessage({
    channel: ctx.channelId,
    text: [
      `:checkered_flag: *${drill.name}* has ended.`,
      `Duration: *${formatElapsed(drill.startedAt)}* · Events recorded: *${total}* (${breakdown})`,
      "",
      "Drill ended. Scoring in progress…",
      `Results: ${env.webAppUrl}/drills/${drill.id}?tab=scores`,
    ].join("\n"),
  });
  return ctx.respond("Drill ended.");
}
