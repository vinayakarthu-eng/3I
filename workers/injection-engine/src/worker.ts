import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../../.env") });

const { system } = await import("@drillforce/core");
const { InjectionEngine } = await import("./engine");
const { registerGauges, sendDatadogEvent } = await import("./generators");
const { Telemetry } = await import("./telemetry");

const mode = process.env.DD_API_KEY ? "datadog" : "dry_run";
const tel = new Telemetry(mode);
registerGauges(tel);
const engine = new InjectionEngine(tel, {
  listRunning: () => system.listRunningSignals(),
  persist: (id, stats, opts) => system.updateSignalProgress(id, stats, opts),
  sendEvent: sendDatadogEvent,
});

console.log(
  mode === "datadog"
    ? `💉 Injection engine → Datadog (${process.env.DD_SITE || "datadoghq.com"}) via OTLP at ${process.env.DD_OTLP_ENDPOINT || "http://localhost:4318"}`
    : "💉 Injection engine in DRY RUN (no DD_API_KEY): generating and counting telemetry, sending nothing",
);

let running = false;
let lastActive = -1;
const timer = setInterval(async () => {
  if (running) return;
  running = true;
  try {
    await engine.tick();
    if (engine.active !== lastActive) {
      lastActive = engine.active;
      console.log(`   ${engine.active} stream(s) injecting`);
    }
  } catch (err) {
    console.error("Injection tick failed:", (err as Error).message);
  } finally {
    running = false;
  }
}, 1000);

async function shutdown() {
  clearInterval(timer);
  await tel.flush().catch(() => {});
  await tel.shutdown().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
