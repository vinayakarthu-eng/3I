/**
 * Live demo mode — the whole product, running for real, in one command:
 *
 *   npm run demo                                   # database_failover, real time
 *   npm run demo -- --scenario credential_stuffing --speed 2
 *   npm run demo -- --no-drill                     # start everything, open drills yourself
 *
 * Starts Postgres + the DrillForce web app (or reuses one on :3000), gives the War Room its own
 * API key, starts the War Room (live Slack when war-room/.env has tokens, otherwise the browser
 * simulator) recording into DrillForce, and opens a drill as a monitoring alert. You play the
 * responder. Ctrl+C ends the drill properly (it's scored in DrillForce) and stops everything.
 */
import { config } from "dotenv";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(ROOT, ".env") });

const SCENARIOS = ["database_failover", "credential_stuffing", "canary_leak"];
const ALERTS: Record<string, { title: string; service: string }> = {
  database_failover: { title: "Live demo — primary DB health checks failing", service: "postgres" },
  credential_stuffing: { title: "Live demo — login failure spike", service: "auth" },
  canary_leak: { title: "Live demo — canary pods OOMKilled", service: "k8s deploy" },
};
const KEY_NAME = "Live demo (War Room)";
const WEB = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
const WAR_ROOM_PORT = Number(process.env.WAR_ROOM_PORT) || 3100;
const WAR_ROOM = `http://localhost:${WAR_ROOM_PORT}`;
const LOGS = path.join(ROOT, ".demo");

// ─── args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const scenario = flag("scenario") ?? "database_failover";
const speed = Number(flag("speed") ?? 1);
const openDrill = !args.includes("--no-drill");
if (!SCENARIOS.includes(scenario)) fail(`Unknown --scenario "${scenario}". Pick one of: ${SCENARIOS.join(", ")}.`);
if (!(speed >= 1 && speed <= 10)) fail("--speed must be between 1 (real time) and 10.");

// ─── helpers ──────────────────────────────────────────────────────────────────
const c = { bold: "\x1b[1m", dim: "\x1b[2m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m", red: "\x1b[31m", off: "\x1b[0m" };
const step = (msg: string) => console.log(`${c.cyan}▸${c.off} ${msg}`);
function fail(msg: string): never {
  console.error(`${c.red}✗ ${msg}${c.off}`);
  process.exit(1);
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function up(url: string) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

async function waitFor(url: string, seconds: number, label: string) {
  for (let i = 0; i < seconds; i++) {
    if (await up(url)) return;
    await wait(1000);
  }
  fail(`${label} didn't come up within ${seconds}s — see ${path.relative(ROOT, LOGS)}/.`);
}

const children: ChildProcess[] = [];
function start(name: string, cmd: string, cmdArgs: string[], opts: { cwd?: string; env?: Record<string, string> } = {}) {
  mkdirSync(LOGS, { recursive: true });
  const log = createWriteStream(path.join(LOGS, `${name}.log`), { flags: "w" });
  const child = spawn(cmd, cmdArgs, { cwd: opts.cwd ?? ROOT, env: { ...process.env, ...opts.env }, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout!.pipe(log);
  child.stderr!.pipe(log);
  children.push(child);
  return child;
}

// ─── 1. database ──────────────────────────────────────────────────────────────
step("Postgres (docker compose)…");
const docker = spawnSync("docker", ["compose", "up", "-d"], { cwd: ROOT, stdio: "pipe" });
if (docker.status !== 0) {
  console.log(`  ${c.yellow}docker compose failed — assuming Postgres is already running.${c.off}`);
}
step("Migrations…");
const migrate = spawnSync("npm", ["run", "db:migrate", "--silent"], { cwd: ROOT, stdio: "pipe" });
if (migrate.status !== 0) fail(`Migrations failed:\n${migrate.stderr?.toString() || migrate.stdout?.toString()}`);

// ─── 2. web app ───────────────────────────────────────────────────────────────
let startedWeb = false;
if (await up(`${WEB}/api/v1`)) {
  step(`DrillForce web already running at ${WEB} — reusing it.`);
} else {
  step(`Starting DrillForce web at ${WEB} (first compile takes ~20s)…`);
  start("web", "npm", ["run", "dev", "-w", "@drillforce/web"]);
  startedWeb = true;
  await waitFor(`${WEB}/api/v1`, 120, "The web app");
}

// ─── 3. API key for the War Room ──────────────────────────────────────────────
step("Issuing the War Room's API key…");
const core = await import("@drillforce/core");
const { user, org } = await core.resolveDefaultActor();
const ctx = { orgId: org.id, userId: user.id };
for (const old of await core.listApiKeys(ctx)) {
  if (old.name === KEY_NAME) await core.revokeApiKey(ctx, old.id); // one live demo key at a time
}
const { raw: apiKey } = await core.createApiKey(ctx, KEY_NAME);

// ─── 4. War Room ──────────────────────────────────────────────────────────────
if (await up(`${WAR_ROOM}/api/status`)) fail(`Something is already listening on ${WAR_ROOM}. Stop it, or set WAR_ROOM_PORT.`);
step(`Starting the War Room on ${WAR_ROOM}…`);
const warRoom = start("war-room", "node", ["server.js"], {
  cwd: path.join(ROOT, "war-room"),
  env: { PORT: String(WAR_ROOM_PORT), DRILLFORCE_API_URL: WEB, DRILLFORCE_WEB_URL: WEB, DRILLFORCE_API_KEY: apiKey },
});
let drillId: string | null = null;
warRoom.stdout!.on("data", (buf: Buffer) => {
  for (const line of buf.toString().split("\n")) {
    const m = /\[drillforce\] recording as drill ([0-9a-f-]{36})/.exec(line);
    if (m) drillId = m[1];
    if (/\[drillforce\]/.test(line)) console.log(`  ${c.dim}${line.trim()}${c.off}`);
  }
});
await waitFor(`${WAR_ROOM}/api/status`, 30, "The War Room");
const { mode } = (await (await fetch(`${WAR_ROOM}/api/status`)).json()) as { mode: "live" | "simulator" };

// ─── 5. drill ─────────────────────────────────────────────────────────────────
let channel = "";
if (openDrill) {
  step(`Opening a ${scenario} drill (speed ${speed}${speed === 1 ? ", real time" : "×"})…`);
  const res = await fetch(`${WAR_ROOM}/api/alert`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...ALERTS[scenario], scenario, severity: "SEV1", speed }),
  });
  const body = (await res.json()) as { channel?: string | { name?: string } };
  channel = typeof body.channel === "object" ? (body.channel?.name ?? "") : (body.channel ?? "");
  for (let i = 0; i < 15 && !drillId; i++) await wait(1000);
}

// ─── banner ───────────────────────────────────────────────────────────────────
const line = "─".repeat(66);
console.log(`\n${line}\n  ${c.bold}${c.green}DrillForce — LIVE DEMO MODE${c.off}  ${c.dim}(${mode === "live" ? "real Slack" : "simulator: no Slack tokens in war-room/.env"})${c.off}\n${line}`);
console.log(`  DrillForce app      ${WEB}`);
if (drillId) console.log(`  This drill          ${WEB}/drills/${drillId}`);
console.log(`  War Room dashboard  ${WAR_ROOM}`);
if (channel) console.log(`  Slack channel       ${mode === "live" ? `#${channel}` : `(simulated) ${channel}`}`);
if (openDrill) {
  console.log(`\n  ${c.bold}You're the responder.${c.off} Type in ${mode === "live" ? "the Slack channel" : "the dashboard chat"} — the agents react:`);
  console.log(`    ${c.cyan}I'll take ops${c.off}                       → IC assigns you a role`);
  console.log(`    ${c.cyan}root cause found: <what>${c.off}            → moves to mitigating`);
  console.log(`    ${c.cyan}I propose we fail over to the replica${c.off} → go/no-go`);
  console.log(`    ${c.cyan}fix deployed${c.off}  then  ${c.cyan}all clear${c.off}         → monitoring → resolved`);
  console.log(`  Injects keep arriving (${speed === 1 ? "real time" : `${speed}× speed`}). ${mode === "live" ? "/sitrep and /drill-stop work in Slack." : ""}`);
  console.log(`\n  When it resolves, the drill is scored in DrillForce — open it, then ${c.bold}Generate AAR${c.off}.`);
} else {
  console.log(`\n  No drill opened. Start one from the dashboard${mode === "live" ? " or with /drill in Slack" : ""}.`);
}
console.log(`  ${c.dim}Logs: ${path.relative(ROOT, LOGS)}/   ·   Ctrl+C ends the drill and stops everything.${c.off}\n${line}\n`);

// ─── shutdown ─────────────────────────────────────────────────────────────────
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log("\nEnding the drill (it'll be scored in DrillForce)…");
  await fetch(`${WAR_ROOM}/api/drill/stop`, { method: "POST", signal: AbortSignal.timeout(5000) }).catch(() => {});
  await wait(3000); // let the recorder hand the drill to scoring
  for (const child of children) child.kill("SIGTERM");
  if (drillId) console.log(`Results: ${WEB}/drills/${drillId}?tab=scores`);
  if (!startedWeb) console.log("(The web app was already running, so it's still up.)");
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
warRoom.on("exit", (code) => {
  if (!stopping) fail(`The War Room exited (code ${code}). See ${path.relative(ROOT, LOGS)}/war-room.log.`);
});
