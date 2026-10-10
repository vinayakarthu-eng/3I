import "server-only";
import {
  and,
  count,
  db,
  desc,
  drillObjectives,
  drills,
  drillScores,
  eq,
  improvementActions,
  inArray,
  sql,
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
      objectives: { orderBy: (o, { asc }) => [asc(o.sortOrder)] },
      participants: { with: { user: true } },
    },
  });
  if (!drill) return null;

  const [composite] = await db
    .select({ score: compositeScores.score })
    .from(compositeScores)
    .where(eq(compositeScores.drillId, id));

  return { ...drill, score: composite?.score == null ? null : Number(composite.score) };
}

export async function listOrgUsers(orgId: string) {
  return db.query.users.findMany({
    where: (u, { eq }) => eq(u.orgId, orgId),
    orderBy: (u, { asc }) => [asc(u.name)],
    columns: { id: true, name: true, email: true, role: true },
  });
}
