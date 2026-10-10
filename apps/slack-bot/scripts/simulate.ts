/**
 * Runs a drill end-to-end against the real database with a fake Slack client:
 *   npm run simulate -w @drillforce/slack-bot -- <drill-id>
 * Useful for demos and for exercising the bot without a Slack workspace.
 */
process.env.SLACK_BOT_TOKEN ||= "xoxb-simulated";
process.env.SLACK_APP_TOKEN ||= "xapp-simulated";
process.env.IC_QUIET_MIN_SECONDS ||= "0";
process.env.IC_QUIET_MAX_SECONDS ||= "0";

const { db, drills, eq, users } = await import("@drillforce/db");
const { handleCommand } = await import("../src/commands");
const { DrillSessionManager } = await import("../src/drill-session");
const { logEvent } = await import("../src/events");

const drillId = process.argv[2];
if (!drillId) {
  console.error("Usage: npm run simulate -w @drillforce/slack-bot -- <drill-id>");
  process.exit(1);
}

const orgUsers = await db.select().from(users);
const slackUsers = new Map(orgUsers.map((u, i) => [`U${i + 1}`, u]));
let ts = Date.now() / 1000;
const nextTs = () => (ts += 1).toFixed(6);

// Minimal stand-in for Slack's WebClient: prints what the bot would post.
const fakeClient = {
  conversations: {
    create: async ({ name }: { name: string }) => ({ channel: { id: "CSIM", name } }),
    invite: async ({ users }: { users: string }) => (console.log(`👥 invited ${users}`), { ok: true }),
  },
  users: {
    lookupByEmail: async ({ email }: { email: string }) => {
      const hit = [...slackUsers].find(([, u]) => u.email === email);
      return { user: hit ? { id: hit[0] } : undefined };
    },
    info: async ({ user }: { user: string }) => {
      const u = slackUsers.get(user);
      return { user: { name: u?.name, profile: { email: u?.email, real_name: u?.name } } };
    },
  },
  chat: {
    postMessage: async ({ text }: { text: string }) => {
      console.log(`\n🤖 ${text}\n`);
      return { ts: nextTs() };
    },
  },
} as never;

const sessions = new DrillSessionManager(fakeClient);
const ctx = (channelId: string, userId = "U1") => ({
  client: fakeClient,
  sessions,
  channelId,
  userId,
  respond: async (text: string) => console.log(`(ephemeral) ${text}`),
});

console.log("▶ /drillforce start");
await handleCommand(`start ${drillId}`, ctx("CGENERAL"));
const session = sessions.get("CSIM");
if (!session) process.exit(1);

async function say(slackUser: string, text: string) {
  const u = slackUsers.get(slackUser)!;
  console.log(`💬 ${u.name}: ${text}`);
  await logEvent({
    drillId: session!.drillId,
    eventType: "message",
    actor: u.id,
    channel: `#${session!.channelName}`,
    payload: { text, ts: nextTs(), user: slackUser, user_name: u.name },
  });
  sessions.touch("CSIM");
}

await say("U2", "Ack — looking at the alert now, seeing errors across regions.");
await say("U3", "Declaring an incident. I'll take IC comms.");
await sessions.reply("CSIM", slackUsers.get("U2")!.name, "Do we know which customers are affected?", "1");

console.log("▶ /drillforce inject");
await handleCommand("inject Monitoring shows error rates climbing to 40%", ctx("CSIM"));

console.log("▶ quiet channel → IC nudge");
// @ts-expect-error — reach into the private loop for the simulation
await sessions.checkQuietChannels();

console.log("▶ /drillforce status");
await handleCommand("status", ctx("CSIM"));

console.log("▶ /drillforce end");
await handleCommand("end", ctx("CSIM"));

const [final] = await db.select().from(drills).where(eq(drills.id, drillId));
console.log(`\n✅ Drill is now "${final.status}" (started ${final.startedAt?.toISOString()}, ended ${final.endedAt?.toISOString()})`);
process.exit(0);
