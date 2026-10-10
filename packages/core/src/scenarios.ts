import { asc, db, drillTemplates, eq } from "@drillforce/db";
import { notFound } from "./errors";

/** The scenario library is global (not org-scoped). */
export async function listScenarios(opts: { quickDrillsOnly?: boolean } = {}) {
  const rows = await db.select().from(drillTemplates).orderBy(asc(drillTemplates.sortOrder));
  const filtered = opts.quickDrillsOnly ? rows.filter((r) => r.isQuickDrill) : rows;
  return filtered.map(serialize);
}

export async function getScenario(id: string) {
  const [row] = await db.select().from(drillTemplates).where(eq(drillTemplates.id, id));
  if (!row) throw notFound("Scenario");
  return serialize(row);
}

function serialize(t: typeof drillTemplates.$inferSelect) {
  return {
    id: t.id,
    name: t.name,
    sector: t.sector,
    type: t.type,
    description: t.description,
    estimatedDurationMinutes: t.estimatedDurationMinutes,
    difficulty: t.difficulty,
    basedOn: t.basedOn,
    isQuickDrill: t.isQuickDrill,
    competencyAreasTested: t.competencyAreasTested,
    scenario: t.scenario,
    objectives: t.objectives,
  };
}
