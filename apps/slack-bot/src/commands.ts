import type { WebClient } from "@slack/web-api";
import { changeDrillStatus, system, type Drill } from "@drillforce/core";
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
import { channelKey, type Workspace } from "./workspaces";

export interface CommandContext {
  client: WebClient;
  sessions: DrillSessionManager;
  /** The workspace the command came from — and so the only org whose drills it can touch. */
  workspace: Workspace;
  channelId: string;
  userId: string;
  /** Sends an ephemeral reply to the person who ran the command. */
  respond: (text: string) => Promise<unknown>;
}

export const HELP_TEXT = [
  "*DrillForce commands*",
  "• `/drillforce start <drill-id>` – open a drill channel, brief participants, and start the IC bot",
  "• `/drillforce status` – elapsed time and objectives (run inside a drill channel)",
  "• `/drillforce inject <description>` – post an ad-hoc inject (scheduled injects fire automatically)",
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

/** A drill in the workspace's org, by full UUID or a unique prefix of at least 6 characters. */
const findDrill = (ctx: CommandContext, idOrPrefix: string) => system.findDrillByIdPrefix(ctx.workspace.orgId, idOrPrefix);
const sessionKey = (ctx: CommandContext, channelId = ctx.channelId) => channelKey(ctx.workspace.teamId, channelId);

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
  const drill = await findDrill(ctx, arg);
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
  const participants = await system.listDrillParticipantContacts(drill.id);

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

  const objectives = await system.listDrillObjectives(drill.id);

  // Mark the drill active (through core: validated transition, timeline event, drill.started
  // webhook) and remember where it runs. A Scheduled drill passes through Briefing first.
  const starter = await resolveSlackUser(ctx.client, ctx.workspace.orgId, ctx.userId);
  const acting = await system.actingCtx(drill, starter.actor);
  const attribution = { actor: starter.actor, channel: `#${channel.name}` };
  if (drill.status === "scheduled") {
    await changeDrillStatus(acting, drill.id, "briefing", {
      ...attribution,
      text: `Briefing opened in Slack (#${channel.name}) by ${starter.name}`,
    });
  }
  await changeDrillStatus(acting, drill.id, "active", {
    ...attribution,
    text: `Drill started in Slack (#${channel.name}) by ${starter.name}`,
    config: { slack: { teamId: ctx.workspace.teamId, channelId: channel.id, channelName: channel.name } },
  });
  const updated = (await system.getDrillById(drill.id))!;

  await ctx.sessions.attach(updated, ctx.workspace, {
    teamId: ctx.workspace.teamId,
    channelId: channel.id,
    channelName: channel.name,
  });
  const injectCount = ctx.sessions.get(sessionKey(ctx, channel.id))?.pendingInjects.length ?? 0;

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
    injectCount
      ? `:stopwatch: *${injectCount} timed inject${injectCount === 1 ? "" : "s"}* will fire automatically as the drill progresses.`
      : null,
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
  const session = ctx.sessions.get(sessionKey(ctx));
  let drill: Drill | null = null;
  if (session) {
    drill = await system.getDrillById(session.drillId);
  } else if (arg) {
    const found = await findDrill(ctx, arg);
    drill = found === "ambiguous" ? null : found;
  }
  if (!drill) {
    return ctx.respond("Run `/drillforce status` inside a drill channel, or pass a drill ID.");
  }

  const objectives = await system.listDrillObjectives(drill.id);
  const { total: eventCount } = await system.getDrillEventStats(drill.id);

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
  const session = ctx.sessions.get(sessionKey(ctx));
  if (!session) return ctx.respond("Run `/drillforce inject` inside an active drill channel.");
  if (!arg) return ctx.respond("Usage: `/drillforce inject <description>`");
  await ctx.sessions.post(sessionKey(ctx), arg, { asInject: true });
  return ctx.respond("Inject posted.");
}

// ─── end ────────────────────────────────────────────────────────────────────

async function endDrill(ctx: CommandContext) {
  const session = ctx.sessions.get(sessionKey(ctx));
  if (!session) return ctx.respond("Run `/drillforce end` inside an active drill channel.");

  const drill = await system.getDrillById(session.drillId);
  if (!drill || drill.status !== "active") {
    ctx.sessions.detach(sessionKey(ctx));
    return ctx.respond("This drill is no longer active.");
  }

  // Through core: timeline event, drill.ended webhook, then auto-scoring (+ drill.scored).
  const ender = await resolveSlackUser(ctx.client, ctx.workspace.orgId, ctx.userId);
  ctx.sessions.detach(sessionKey(ctx));
  await changeDrillStatus(await system.actingCtx(drill, ender.actor), drill.id, "scoring", {
    actor: ender.actor,
    channel: `#${session.channelName}`,
    text: `Drill ended in Slack by ${ender.name}`,
  });

  const { total, byType } = await system.getDrillEventStats(drill.id);
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
