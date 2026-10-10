import { env } from "./env";
import { App, LogLevel } from "@slack/bolt";
import { and, db, drillParticipants, eq, isNull } from "@drillforce/db";
import { handleCommand } from "./commands";
import { DrillSessionManager } from "./drill-session";
import { logEvent, slackTsToDate } from "./events";
import { resolveSlackUser } from "./users";

const app = new App({
  token: env.slackBotToken,
  appToken: env.slackAppToken,
  socketMode: true,
  logLevel: LogLevel.WARN,
});

const sessions = new DrillSessionManager(app.client);
let botUserId = "";

// ─── /drillforce ────────────────────────────────────────────────────────────

app.command("/drillforce", async ({ command, ack, respond, client }) => {
  await ack();
  try {
    await handleCommand(command.text, {
      client,
      sessions,
      channelId: command.channel_id,
      userId: command.user_id,
      respond: (text) => respond({ response_type: "ephemeral", text }),
    });
  } catch (err) {
    console.error("Command failed:", err);
    const code = (err as { data?: { error?: string } }).data?.error;
    await respond({
      response_type: "ephemeral",
      text: `Something went wrong${code ? ` (\`${code}\`)` : ""}. Check the bot logs for details.`,
    });
  }
});

// ─── channel messages ───────────────────────────────────────────────────────

app.event("message", async ({ event, client }) => {
  const session = sessions.get(event.channel);
  if (!session) return;

  // Skip edits/deletes/joins and anything posted by bots (our own posts are logged when sent).
  if (event.subtype !== undefined && event.subtype !== "thread_broadcast") return;
  if ("bot_id" in event && event.bot_id) return;
  if (!("user" in event) || !event.user) return;

  const text = "text" in event ? (event.text ?? "") : "";
  const threadTs = "thread_ts" in event ? event.thread_ts : undefined;
  const user = await resolveSlackUser(client, event.user);

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
  sessions.touch(event.channel);

  // The IC answers when @mentioned, or when someone asks a question in a thread under one of its posts.
  const mentioned = botUserId && text.includes(`<@${botUserId}>`);
  const questionToBot = text.includes("?") && sessions.isReplyToBot(event.channel, threadTs);
  if (mentioned || questionToBot) {
    const question = text.replace(new RegExp(`<@${botUserId}>`, "g"), "").trim();
    await sessions.reply(event.channel, user.name, question, threadTs ?? event.ts);
  }
});

// ─── reactions ──────────────────────────────────────────────────────────────

app.event("reaction_added", async ({ event, client }) => {
  if (event.item.type !== "message") return;
  const session = sessions.get(event.item.channel);
  if (!session || event.user === botUserId) return;
  const user = await resolveSlackUser(client, event.user);
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
  sessions.touch(event.item.channel);
});

// ─── joins: record when participants arrive ─────────────────────────────────

app.event("member_joined_channel", async ({ event, client }) => {
  const session = sessions.get(event.channel);
  if (!session || event.user === botUserId) return;
  const user = await resolveSlackUser(client, event.user);
  if (!user.actor.startsWith("slack:")) {
    await db
      .update(drillParticipants)
      .set({ joinedAt: new Date() })
      .where(
        and(
          eq(drillParticipants.drillId, session.drillId),
          eq(drillParticipants.userId, user.actor),
          isNull(drillParticipants.joinedAt),
        ),
      );
  }
});

// ─── startup ────────────────────────────────────────────────────────────────

async function main() {
  const auth = await app.client.auth.test();
  botUserId = auth.user_id ?? "";
  await sessions.restore();
  sessions.start();
  await app.start();
  console.log(
    `⚡ DrillForce IC bot connected to ${auth.team} as @${auth.user} (socket mode). ` +
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
