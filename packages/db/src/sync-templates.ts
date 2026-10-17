import { config } from "dotenv";
import { sql } from "drizzle-orm";

config({ path: "../../.env" });

/**
 * Upserts the scenario library (shared/templates.ts) into drill_templates by id — safe to run
 * any time, unlike `db:seed`, which resets all data. Run after adding or editing templates.
 */
const { db } = await import("./client");
const { drillTemplates } = await import("./schema");
const { DRILL_TEMPLATES } = await import("@drillforce/shared");

const rows = DRILL_TEMPLATES.map((t, i) => ({
  id: t.id,
  name: t.name,
  sector: t.sector,
  type: t.type,
  description: t.description,
  estimatedDurationMinutes: t.estimatedDurationMinutes,
  difficulty: t.difficulty,
  basedOn: t.basedOn,
  isQuickDrill: t.isQuickDrill,
  scenario: t.scenario,
  objectives: t.objectives,
  competencyAreasTested: t.competencyAreasTested,
  sortOrder: i,
}));
await db
  .insert(drillTemplates)
  .values(rows)
  .onConflictDoUpdate({
    target: drillTemplates.id,
    set: Object.fromEntries(
      Object.keys(rows[0])
        .filter((k) => k !== "id")
        .map((k) => [k, sql.raw(`excluded.${k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}`)]),
    ),
  });
console.log(`✅ Scenario library synced (${rows.length} templates)`);
process.exit(0);
