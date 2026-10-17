import { env } from "./env";
import { App, LogLevel } from "@slack/bolt";
import { ApiError, system } from "@drillforce/core";
import { handleCommand } from "./commands";
import { DrillSessionManager } from "./drill-session";
import { logEvent, slackTsToDate } from "./events";
import { resolveSlackUser } from "./users";
import { channelKey, clientFor, countWorkspaces, initLegacyWorkspace, workspaceForTeam } from "./workspaces";

// One Socket Mode connection serves every connected workspace; `authorize` picks the
// workspace's own bot token for each incoming event or command.
const app = new App({
  appToken: env.slackAppToken,
  socketMode: true,
  logLevel: LogLevel.WARN,
  authorize: async ({ teamId }) => {
    const workspace = await workspaceForTeam(teamId);
    if (!workspace) throw new Error(`Slack workspace ${teamId} isn't connected to any DrillForce organization.`);
    return { botToken: workspace.botToken, botUserId: workspace.botUserId, teamId: workspace.teamId };
  },
});

const sessions = new DrillSessionManager(clientFor);

const NOT_CONNECTED =
  "This Slack workspace isn't connected to DrillForce yet. An admin can connect it in DrillForce → Settings → Integrations → Add to Slack.";

// ─── /drillforce ────────────────────────────────────────────────────────────

app.command("/drillforce", async ({ command, ack, respond, client }) => {
  await ack();
  const workspace = await workspaceForTeam(command.team_id);
  if (!workspace) {
    await respond({ response_type: "ephemeral", text: NOT_CONNECTED });
    return;
  }
  try {
    await handleCommand(command.text, {
      client,
      sessions,
      workspace,
      channelId: command.channel_id,
      userId: command.user_id,
      respond: (text) => respond({ response_type: "ephemeral", text }),
    });
  } catch (err) {
    if (err instanceof ApiError) {
      await respond({ response_type: "ephemeral", text: err.message });
      return;
    }
    console.error("Command failed:", err);
    const code = (err as { data?: { error?: string } }).data?.error;
    await respond({
      response_type: "ephemeral",
      text: `Something went wrong${code ? ` (\`${code}\`)` : ""}. Check the bot logs for details.`,
    });
  }
});

// ─── channel messages ───────────────────────────────────────────────────────

app.event("message", async ({ event, client, context }) => {
  const workspace = await workspaceForTeam(context.teamId);
  if (!workspace) return;
  const key = channelKey(workspace.teamId, event.channel);
  const session = sessions.get(key);
  if (!session) return;

  // Skip edits/deletes/joins and anything posted by bots (our own posts are logged when sent).
  if (event.subtype !== undefined && event.subtype !== "thread_broadcast") return;
  if ("bot_id" in event && event.bot_id) return;
  if (!("user" in event) || !event.user) return;

  const text = "text" in event ? (event.text ?? "") : "";
  const threadTs = "thread_ts" in event ? event.thread_ts : undefined;
  const user = await resolveSlackUser(client, workspace.orgId, event.user);

  await logEvent({
    drillId: session.drillId,
    eventType: "message",
    actor: user.actor,
    channel: `#${session.channelName}`,
    payload: {
      text,
      ts: event.ts,
      user: event.user,
      user_name: user.name,
      ...(threadTs && threadTs !== event.ts ? { thread_ts: threadTs, parent_ts: threadTs } : {}),
    },
    occurredAt: slackTsToDate(event.ts),
  });
  sessions.touch(key);

  // The IC answers when @mentioned, or when someone asks a question in a thread under one of its posts.
  const botUserId = workspace.botUserId;
  const mentioned = text.includes(`<@${botUserId}>`);
  const questionToBot = text.includes("?") && sessions.isReplyToBot(key, threadTs);
  if (mentioned || questionToBot) {
    const question = text.replace(new RegExp(`<@${botUserId}>`, "g"), "").trim();
    await sessions.reply(key, user.name, question, threadTs ?? event.ts);
  }
});

// ─── reactions ──────────────────────────────────────────────────────────────

app.event("reaction_added", async ({ event, client, context }) => {
  if (event.item.type !== "message") return;
  const workspace = await workspaceForTeam(context.teamId);
  if (!workspace) return;
  const key = channelKey(workspace.teamId, event.item.channel);
  const session = sessions.get(key);
  if (!session || event.user === workspace.botUserId) return;
  const user = await resolveSlackUser(client, workspace.orgId, event.user);
  await logEvent({
    drillId: session.drillId,
    eventType: "action",
    actor: user.actor,
    channel: `#${session.channelName}`,
    payload: {
      text: `${user.name} reacted :${event.reaction}:`,
      reaction: event.reaction,
      item_ts: event.item.ts,
      user: event.user,
    },
    occurredAt: slackTsToDate(event.event_ts),
  });
  sessions.touch(key);
});

// ─── joins: record when participants arrive ─────────────────────────────────

app.event("member_joined_channel", async ({ event, client, context }) => {
  const workspace = await workspaceForTeam(context.teamId);
  if (!workspace) return;
  const session = sessions.get(channelKey(workspace.teamId, event.channel));
  if (!session || event.user === workspace.botUserId) return;
  const user = await resolveSlackUser(client, workspace.orgId, event.user);
  if (!user.actor.startsWith("slack:")) {
    await system.markParticipantJoined(session.drillId, user.actor);
  }
});

// ─── startup ────────────────────────────────────────────────────────────────

async function main() {
  await initLegacyWorkspace();
  const connected = await countWorkspaces();
  await sessions.restore();
  sessions.start();
  await app.start();
  console.log(
    `⚡ DrillForce IC bot online (socket mode) — ${connected} connected workspace${connected === 1 ? "" : "s"}` +
      (connected ? "." : "; orgs connect via Settings → Integrations → Add to Slack.") +
      " " +
      (env.anthropicApiKey ? `IC model: ${env.anthropicModel}.` : "No ANTHROPIC_API_KEY — using scripted IC lines."),
  );
}

async function shutdown() {
  sessions.stop();
  await app.stop().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((err) => {
  console.error("❌ Failed to start the Slack bot:", err?.data?.error ?? err);
  process.exit(1);
});
