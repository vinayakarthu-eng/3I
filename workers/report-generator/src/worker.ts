import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../../.env") });

const { and, db, drillReports, drills, eq, sql } = await import("@drillforce/db");
const { generateAar } = await import("./generate");

const POLL_MS = Number(process.env.REPORT_POLL_MS ?? 10000);
let running = false;

/** Generates an AAR for drills that reached Debriefing without one. */
async function tick() {
  if (running) return;
  running = true;
  try {
    const pending = await db
      .select({ id: drills.id, name: drills.name })
      .from(drills)
      .where(
        and(
          eq(drills.status, "debriefing"),
          sql`not exists (select 1 from ${drillReports} r where r.drill_id = ${drills.id} and r.report_type = 'aar')`,
        ),
      );
    for (const drill of pending) {
      try {
        console.log(`📝 Generating AAR for "${drill.name}"…`);
        const report = await generateAar(drill.id);
        console.log(`✅ AAR ready for "${drill.name}" (${report.generatedBy})`);
      } catch (err) {
        console.error(`AAR generation failed for "${drill.name}":`, err);
      }
    }
  } catch (err) {
    console.error("Report worker poll failed:", (err as Error).message);
  } finally {
    running = false;
  }
}

console.log(
  `📝 Report generator watching for drills in Debriefing (every ${POLL_MS / 1000}s)` +
    (process.env.ANTHROPIC_API_KEY ? "" : " — no ANTHROPIC_API_KEY, using the template generator"),
);
await tick();
const timer = setInterval(tick, POLL_MS);
process.on("SIGINT", () => (clearInterval(timer), process.exit(0)));
process.on("SIGTERM", () => (clearInterval(timer), process.exit(0)));
