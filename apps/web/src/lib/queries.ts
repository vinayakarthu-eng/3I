import "server-only";
import {
  and,
  asc,
  competencyAreas,
  count,
  db,
  desc,
  drillComposites,
  drillInjects,
  drillObjectives,
  drillReports,
  drills,
  drillScores,
  eq,
  improvementActions,
  inArray,
  sql,
  users,
} from "@drillforce/db";

/**
 * Composite score per drill = weighted average of normalized objective scores,
 * using each objective's weight. Null when a drill has no scores yet.
 */
const compositeScores = db
  .select({
    drillId: drillScores.drillId,
    score: sql<string | null>`
      round(
        sum(${drillScores.normalizedScore} * coalesce(${drillObjectives.weight}, 1))
        / nullif(sum(coalesce(${drillObjectives.weight}, 1)), 0)
      , 1)`.as("score"),
  })
  .from(drillScores)
  .leftJoin(drillObjectives, eq(drillScores.objectiveId, drillObjectives.id))
  .groupBy(drillScores.drillId)
  .as("composite_scores");

export type DrillListItem = Awaited<ReturnType<typeof listDrills>>[number];

export async function listDrills(orgId: string, limit?: number) {
  const query = db
    .select({
      id: drills.id,
      name: drills.name,
      type: drills.type,
      status: drills.status,
      scheduledAt: drills.scheduledAt,
      createdAt: drills.createdAt,
      score: compositeScores.score,
    })
    .from(drills)
    .leftJoin(compositeScores, eq(compositeScores.drillId, drills.id))
    .where(eq(drills.orgId, orgId))
    .orderBy(desc(sql`coalesce(${drills.scheduledAt}, ${drills.createdAt})`));

  const rows = limit ? await query.limit(limit) : await query;
  return rows.map((r) => ({ ...r, score: r.score === null ? null : Number(r.score) }));
}

export async function getDashboardStats(orgId: string) {
  const [[total], [active], [avg], [openActions]] = await Promise.all([
    db.select({ value: count() }).from(drills).where(eq(drills.orgId, orgId)),
    db
      .select({ value: count() })
      .from(drills)
      .where(and(eq(drills.orgId, orgId), inArray(drills.status, ["briefing", "active"]))),
    db
      .select({ value: sql<string | null>`round(avg(${compositeScores.score}), 1)` })
      .from(compositeScores)
      .innerJoin(drills, eq(drills.id, compositeScores.drillId))
      .where(eq(drills.orgId, orgId)),
    db
      .select({ value: count() })
      .from(improvementActions)
      .innerJoin(drills, eq(drills.id, improvementActions.drillId))
      .where(
        and(eq(drills.orgId, orgId), inArray(improvementActions.status, ["open", "in_progress"])),
      ),
  ]);

  return {
    totalDrills: total.value,
    activeDrills: active.value,
    avgScore: avg.value === null ? null : Number(avg.value),
    openActions: openActions.value,
  };
}

export async function getDrill(orgId: string, id: string) {
  // Guard against malformed IDs so Postgres doesn't throw on the uuid cast.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;

  const drill = await db.query.drills.findFirst({
    where: (d, { and, eq }) => and(eq(d.id, id), eq(d.orgId, orgId)),
    with: {
      creator: true,
      organization: true,
      objectives: { with: { competencyArea: true }, orderBy: (o, { asc }) => [asc(o.sortOrder)] },
      participants: { with: { user: true }, orderBy: (p, { asc }) => [asc(p.role)] },
      events: { orderBy: (e, { asc }) => [asc(e.occurredAt)] },
      scores: { orderBy: (s, { desc }) => [desc(s.scoredAt)] },
      composite: true,
    },
  });
  if (!drill) return null;

  const [composite] = await db
    .select({ score: compositeScores.score })
    .from(compositeScores)
    .where(eq(compositeScores.drillId, id));

  // Resolve event/score actors (user ids) to display names.
  const orgUsers = await db.query.users.findMany({
    where: (u, { eq }) => eq(u.orgId, orgId),
    columns: { id: true, name: true },
  });
  const actorNames: Record<string, string> = { bot: "IC Bot", system: "System", auto: "Auto-scorer" };
  for (const u of orgUsers) actorNames[u.id] = u.name;

  return {
    ...drill,
    score: composite?.score == null ? null : Number(composite.score),
    actorNames,
  };
}

export type DrillDetail = NonNullable<Awaited<ReturnType<typeof getDrill>>>;

/** Timed injects for a drill, ordered by trigger time. */
export async function listDrillInjects(drillId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(drillId)) return [];
  return db
    .select()
    .from(drillInjects)
    .where(eq(drillInjects.drillId, drillId))
    .orderBy(asc(drillInjects.triggerAtMinutes), asc(drillInjects.sortOrder));
}

export async function listCompetencyAreas() {
  return db.select().from(competencyAreas).orderBy(asc(competencyAreas.sortOrder));
}

export interface CompetencyStat {
  id: string;
  name: string;
  category: string;
  score: number;
  objectives: number;
  /** current − previous drill's score for the same competency; null when no prior data. */
  delta: number | null;
}

/** Per-competency average scores for a drill, with a delta vs. the org's previous scored drill. */
export async function getDrillCompetencyStats(orgId: string, drillId: string): Promise<CompetencyStat[]> {
  if (!/^[0-9a-f-]{36}$/i.test(drillId)) return [];

  // Ordered timeline of this org's scored drills, oldest first.
  const timeline = await db
    .select({ drillId: drillComposites.drillId })
    .from(drillComposites)
    .innerJoin(drills, eq(drills.id, drillComposites.drillId))
    .where(eq(drills.orgId, orgId))
    .orderBy(asc(sql`coalesce(${drills.endedAt}, ${drillComposites.computedAt})`));
  const idx = timeline.findIndex((t) => t.drillId === drillId);
  const prevDrillId = idx > 0 ? timeline[idx - 1].drillId : null;

  const perCompetency = async (id: string) =>
    db
      .select({
        competencyId: competencyAreas.id,
        name: competencyAreas.name,
        category: competencyAreas.category,
        sortOrder: competencyAreas.sortOrder,
        score: sql<string>`round(avg(${drillScores.normalizedScore}), 1)`,
        objectives: count(drillScores.id),
      })
      .from(drillScores)
      .innerJoin(competencyAreas, eq(competencyAreas.id, drillScores.competencyAreaId))
      .where(eq(drillScores.drillId, id))
      .groupBy(competencyAreas.id, competencyAreas.name, competencyAreas.category, competencyAreas.sortOrder)
      .orderBy(asc(competencyAreas.sortOrder));

  const [current, previous] = await Promise.all([
    perCompetency(drillId),
    prevDrillId ? perCompetency(prevDrillId) : Promise.resolve([]),
  ]);
  const prevMap = new Map(previous.map((p) => [p.competencyId, Number(p.score)]));

  return current.map((row) => {
    const score = Number(row.score);
    const prev = prevMap.get(row.competencyId);
    return {
      id: row.competencyId,
      name: row.name,
      category: row.category,
      score,
      objectives: Number(row.objectives),
      delta: prev == null ? null : Math.round((score - prev) * 10) / 10,
    };
  });
}

export async function listOrgUsers(orgId: string) {
  return db.query.users.findMany({
    where: (u, { eq }) => eq(u.orgId, orgId),
    orderBy: (u, { asc }) => [asc(u.name)],
    columns: { id: true, name: true, email: true, role: true },
  });
}

/** Composite scores of the org's scored drills, oldest first, for trend charts. */
export async function getScoreTrend(orgId: string) {
  const rows = await db
    .select({
      drillId: drillComposites.drillId,
      name: drills.name,
      score: drillComposites.compositeScore,
      passed: drillComposites.passed,
      at: sql<Date>`coalesce(${drills.endedAt}, ${drillComposites.computedAt})`,
    })
    .from(drillComposites)
    .innerJoin(drills, eq(drills.id, drillComposites.drillId))
    .where(eq(drills.orgId, orgId))
    .orderBy(sql`coalesce(${drills.endedAt}, ${drillComposites.computedAt})`);
  return rows.map((r) => ({ ...r, score: Number(r.score), at: new Date(r.at) }));
}

export async function listImprovementActions(orgId: string) {
  return db
    .select({
      action: improvementActions,
      drill: { id: drills.id, name: drills.name },
      owner: { id: users.id, name: users.name },
    })
    .from(improvementActions)
    .innerJoin(drills, eq(drills.id, improvementActions.drillId))
    .leftJoin(users, eq(users.id, improvementActions.ownerId))
    .where(eq(drills.orgId, orgId))
    .orderBy(asc(improvementActions.dueDate), desc(improvementActions.createdAt));
}

export type ImprovementActionRow = Awaited<ReturnType<typeof listImprovementActions>>[number];

/** Latest AAR per drill for the Reports page. */
export async function listReports(orgId: string) {
  const rows = await db
    .select({
      id: drillReports.id,
      drillId: drills.id,
      drillName: drills.name,
      drillType: drills.type,
      generatedBy: drillReports.generatedBy,
      generatedAt: drillReports.generatedAt,
      approvedAt: drillReports.approvedAt,
      composite: drillComposites.compositeScore,
      passed: drillComposites.passed,
    })
    .from(drillReports)
    .innerJoin(drills, eq(drills.id, drillReports.drillId))
    .leftJoin(drillComposites, eq(drillComposites.drillId, drills.id))
    .where(and(eq(drills.orgId, orgId), eq(drillReports.reportType, "aar")))
    .orderBy(desc(drillReports.generatedAt));
  const seen = new Set<string>();
  return rows
    .filter((r) => (seen.has(r.drillId) ? false : (seen.add(r.drillId), true)))
    .map((r) => ({ ...r, composite: r.composite == null ? null : Number(r.composite) }));
}
