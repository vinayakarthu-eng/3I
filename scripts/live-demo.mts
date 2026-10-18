/**
 * Live demo mode — the whole drill lifecycle, running for real, in one command:
 *
 *   npm run demo                         # Database Monitoring drill
 *   npm run demo -- --template app       # Application Monitoring drill
 *   npm run demo -- --scoring-delay 2    # score 2 min after concluding (default 15)
 *
 * Starts Postgres, the DrillForce web app, the injection engine, the scoring agent and the War Room
 * (live Slack when war-room/.env has tokens, otherwise its browser simulator), wires them together,
 * and creates a monitoring drill already in Preparation. You open it, review what will be injected,
 * click Execute — the Slack incident channel opens and signals start flowing — work the incident,
 * then Conclude. Ctrl+C concludes a still-running drill and stops everything.
 */
import { config } from "dotenv";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, createWriteStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = path.join(ROOT, ".env");

// ─── args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const TEMPLATES: Record<string, string> = { db: "db-monitoring-primary-failover", app: "app-monitoring-checkout-errors" };
const templateKey = flag("template") ?? "db";
const scoringDelay = flag("scoring-delay") ?? process.env.SCORING_DELAY_MINUTES ?? "15";
if (!TEMPLATES[templateKey]) fail(`Unknown --template "${templateKey}". Use db or app.`);
if (!(Number(scoringDelay) >= 0)) fail("--scoring-delay must be a number of minutes (0 or more).");

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
  fail(`${label} didn't come up within ${seconds}s — see .demo/.`);
}

// ─── 0. wiring: the web app and the War Room share a secret (persisted in .env once) ─────────
const envText = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
if (!/^WAR_ROOM_TOKEN=.+/m.test(envText)) {
  appendFileSync(
    ENV_FILE,
    `\n# Added by \`npm run demo\`: lets DrillForce open Slack incidents through the War Room.\nWAR_ROOM_URL=http://localhost:3100\nWAR_ROOM_TOKEN=${randomBytes(24).toString("hex")}\n`,
  );
  step("Added WAR_ROOM_URL / WAR_ROOM_TOKEN to .env (DrillForce ↔ War Room).");
}
config({ path: ENV_FILE, override: true });
const WEB = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
const WAR_ROOM = (process.env.WAR_ROOM_URL || "http://localhost:3100").replace(/\/+$/, "");
const warRoomPort = new URL(WAR_ROOM).port || "3100";

const LOGS = path.join(ROOT, ".demo");
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
if (spawnSync("docker", ["compose", "up", "-d", "postgres"], { cwd: ROOT, stdio: "pipe" }).status !== 0) {
  console.log(`  ${c.yellow}docker compose failed — assuming Postgres is already running.${c.off}`);
}
step("Migrations + scenario library…");
for (const script of ["db:migrate", "db:templates"]) {
  const r = spawnSync("npm", ["run", script, "--silent"], { cwd: ROOT, stdio: "pipe" });
  if (r.status !== 0) fail(`${script} failed:\n${r.stderr?.toString() || r.stdout?.toString()}`);
}

// ─── 2. services ──────────────────────────────────────────────────────────────
if (await up(`${WEB}/api/v1`)) fail(`Something is already serving ${WEB}. Stop it first — the demo starts the web app with its wiring.`);
if (await up(`${WAR_ROOM}/api/status`)) fail(`Something is already listening on ${WAR_ROOM}. Stop it first.`);
const shared = { SCORING_DELAY_MINUTES: String(scoringDelay) };

step(`DrillForce web at ${WEB} (first compile takes ~20s)…`);
start("web", "npm", ["run", "dev", "-w", "@drillforce/web"], { env: shared });
step("Injection engine…");
start("injection-engine", "npm", ["run", "start", "-w", "@drillforce/injection-engine"], { env: shared });
step(`Scoring agent (scores ${scoringDelay} min after a drill concludes)…`);
start("scoring-agent", "npm", ["run", "start", "-w", "@drillforce/scoring-agent"], { env: shared });
await waitFor(`${WEB}/api/v1`, 150, "The web app");

const core = await import("@drillforce/core");
const { user, org } = await core.resolveDefaultActor();
const ctx = { orgId: org.id, userId: user.id };
const KEY_NAME = "Live demo (War Room)";
for (const old of await core.listApiKeys(ctx)) if (old.name === KEY_NAME) await core.revokeApiKey(ctx, old.id);
const { raw: apiKey } = await core.createApiKey(ctx, KEY_NAME);

step(`War Room on ${WAR_ROOM}…`);
const warRoom = start("war-room", "node", ["server.js"], {
  cwd: path.join(ROOT, "war-room"),
  env: { PORT: warRoomPort, WAR_ROOM_TOKEN: process.env.WAR_ROOM_TOKEN!, DRILLFORCE_API_URL: WEB, DRILLFORCE_WEB_URL: WEB, DRILLFORCE_API_KEY: apiKey },
});
await waitFor(`${WAR_ROOM}/api/status`, 30, "The War Room");
const { mode } = (await (await fetch(`${WAR_ROOM}/api/status`)).json()) as { mode: "live" | "simulator" };

// ─── 3. a drill, planned and scheduled, ready to execute ──────────────────────
step("Creating the drill (Planning → Preparation)…");
const when = new Date(Date.now() + 5 * 60_000).toISOString();
const template = TEMPLATES[templateKey];
const name = `Live demo · ${templateKey === "db" ? "Database Monitoring" : "Application Monitoring"} · ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
const { id: drillId } = await core.createDrill(ctx, { name, templateId: template, scheduledAt: when, status: "draft", participants: [{ email: user.email, role: "incident_commander" }] });
await core.scheduleDrill(ctx, drillId);
const plan = await core.getInjectionPlan(ctx, drillId);

// ─── banner ───────────────────────────────────────────────────────────────────
const line = "─".repeat(70);
const dd = process.env.DD_API_KEY ? "Datadog" : "dry run (add DD_API_KEY to send to Datadog)";
console.log(`\n${line}\n  ${c.bold}${c.green}DrillForce — LIVE DEMO MODE${c.off}  ${c.dim}Slack: ${mode === "live" ? "real workspace" : "War Room simulator"} · telemetry: ${dd}${c.off}\n${line}`);
console.log(`  ${c.bold}Your drill${c.off}          ${WEB}/drills/${drillId}`);
console.log(`  War Room dashboard  ${WAR_ROOM}`);
console.log(`\n  It's in ${c.bold}Preparation${c.off}. The injection matrix (${plan.signals.length} streams, ~${plan.runsForMinutes} min):`);
for (const s of plan.signals) console.log(`    • ${s.description}`);
console.log(`\n  ${c.bold}1.${c.off} Open the drill → ${c.cyan}Review & execute${c.off} → ${c.cyan}Yes, execute now${c.off}`);
console.log(`     ${mode === "live" ? "A Slack incident channel opens and you're invited;" : "The War Room dashboard runs the incident;"} signals start injecting.`);
console.log(`  ${c.bold}2.${c.off} Work the incident in ${mode === "live" ? "Slack" : "the dashboard"} — the IC, Deputy, Comms, Liaison and Scribe respond.`);
console.log(`  ${c.bold}3.${c.off} ${c.cyan}Conclude drill${c.off} (or post "all clear") → “This was a drill — concluded”.`);
console.log(`  ${c.bold}4.${c.off} ${scoringDelay} min later the scoring agent scores it → open the AAR → Complete.`);
console.log(`\n  ${c.dim}Logs: .demo/   ·   Ctrl+C concludes a running drill and stops everything.${c.off}\n${line}\n`);

// ─── shutdown ─────────────────────────────────────────────────────────────────
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  try {
    const drill = await core.system.getDrillById(drillId);
    if (drill?.status === "active") {
      console.log("\nConcluding the running drill…");
      await core.concludeDrill(ctx, drillId);
      await wait(2000);
    }
  } catch (err) {
    console.error("Couldn't conclude the drill:", (err as Error).message);
  }
  for (const child of children) child.kill("SIGTERM");
  console.log(`Results: ${WEB}/drills/${drillId}`);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
warRoom.on("exit", (code) => {
  if (!stopping) fail(`The War Room exited (code ${code}). See .demo/war-room.log.`);
});
