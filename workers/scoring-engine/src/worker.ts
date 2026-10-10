import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../../.env") });

const { and, db, drills, eq, sql } = await import("@drillforce/db");
const { autoScoreDrill } = await import("./engine");

const POLL_MS = Number(process.env.SCORING_POLL_MS ?? 5000);
let running = false;

/** Picks up drills that entered Scoring and haven't been auto-scored yet. */
async function tick() {
  if (running) return;
  running = true;
  try {
    const pending = await db
      .select({ id: drills.id, name: drills.name })
      .from(drills)
      .where(and(eq(drills.status, "scoring"), sql`${drills.config} -> 'scoring' ->> 'autoScoredAt' is null`));

    for (const drill of pending) {
      try {
        const result = await autoScoreDrill(drill.id);
        console.log(
          `📊 Auto-scored "${drill.name}": ${result.scored} objective(s)` +
            (result.finalized ? ` → composite ${result.finalized.composite}, moved to Debriefing` : " (waiting for evaluator scores)"),
        );
      } catch (err) {
        console.error(`Auto-scoring failed for "${drill.name}":`, err);
      }
    }
  } catch (err) {
    console.error("Scoring worker poll failed:", (err as Error).message);
  } finally {
    running = false;
  }
}

console.log(`🧮 Scoring engine watching for drills in Scoring (every ${POLL_MS / 1000}s)`);
await tick();
const timer = setInterval(tick, POLL_MS);
process.on("SIGINT", () => (clearInterval(timer), process.exit(0)));
process.on("SIGTERM", () => (clearInterval(timer), process.exit(0)));
