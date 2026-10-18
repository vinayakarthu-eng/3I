import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../../.env") });

const { runDueScoring, scoringDelayMinutes } = await import("@drillforce/core");
const POLL_MS = Number(process.env.SCORING_POLL_MS ?? 10_000);
const judge = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? "Claude" : "heuristic (set ANTHROPIC_API_KEY for Claude)";

console.log(`🧮 Scoring agent: scores drills ${scoringDelayMinutes()} min after they conclude · judge: ${judge}`);

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    for (const r of await runDueScoring()) {
      console.log(`📊 Scored "${r.name}" — composite ${r.composite ?? "pending evaluator"} (judge: ${r.judge})`);
    }
  } catch (err) {
    console.error("Scoring agent poll failed:", (err as Error).message);
  } finally {
    running = false;
  }
}
await tick();
const timer = setInterval(tick, POLL_MS);
process.on("SIGINT", () => (clearInterval(timer), process.exit(0)));
process.on("SIGTERM", () => (clearInterval(timer), process.exit(0)));
