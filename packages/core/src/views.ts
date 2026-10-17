import {
  and,
  asc,
  competencyAreas,
  count,
  db,
  drillComposites,
  drills,
  drillScores,
  drillTemplates,
  eq,
  improvementActions,
  inArray,
  sql,
  users,
} from "@drillforce/db";
import type { Ctx } from "./context";
import { compositeScores } from "./drills";

/**
 * Read models for the web UI (dashboards, drill detail, reports). Richer and more internal than
 * the curated API representations in drills.ts — but org-scoped the same way.
 */

const UUID = /^[0-9a-f-]{36}$/i;

export async function getDashboardStats(ctx: Ctx) {
  const [[total], [active], [avg], [openActions]] = await Promise.all([
    db.select({ value: count() }).from(drills).where(eq(drills.orgId, ctx.orgId)),
    db
      .select({ value: count() })
      .from(drills)
      .where(and(eq(drills.orgId, ctx.orgId), inArray(drills.status, ["briefing", "active"]))),
    db
      .select({ value: sql<string | null>`round(avg(${compositeScores.score}), 1)` })
      .from(compositeScores)
      .innerJoin(drills, eq(drills.id, compositeScores.drillId))
      .where(eq(drills.orgId, ctx.orgId)),
    db
      .select({ value: count() })
      .from(improvementActions)
      .innerJoin(drills, eq(drills.id, improvementActions.drillId))
      .where(and(eq(drills.orgId, ctx.orgId), inArray(improvementActions.status, ["open", "in_progress"]))),
  ]);

  return {
    totalDrills: total.value,
    activeDrills: active.value,
    avgScore: avg.value === null ? null : Number(avg.value),
    openActions: openActions.value,
  };
}

/** The full drill graph (objectives, participants, events, scores) with actor display names. */
export async function getDrillDetail(ctx: Ctx, id: string) {
  // Guard against malformed IDs so Postgres doesn't throw on the uuid cast.
  if (!UUID.test(id)) return null;

  const drill = await db.query.drills.findFirst({
    where: (d, { and: a, eq: e }) => a(e(d.id, id), e(d.orgId, ctx.orgId)),
    with: {
      creator: true,
      organization: true,
      objectives: { with: { competencyArea: true }, orderBy: (o, { asc: up }) => [up(o.sortOrder)] },
      participants: { with: { user: true }, orderBy: (p, { asc: up }) => [up(p.role)] },
      events: { orderBy: (e, { asc: up }) => [up(e.occurredAt)] },
      scores: { orderBy: (s, { desc: down }) => [down(s.scoredAt)] },
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
    where: (u, { eq: e }) => e(u.orgId, ctx.orgId),
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

export type DrillDetail = NonNullable<Awaited<ReturnType<typeof getDrillDetail>>>;

/** Raw scenario-template rows (the wizard and library need every column). */
export async function listDrillTemplates() {
  return db.select().from(drillTemplates).orderBy(asc(drillTemplates.sortOrder));
}

export async function getDrillTemplate(id: string) {
  const [row] = await db.select().from(drillTemplates).where(eq(drillTemplates.id, id));
  return row ?? null;
}

/** Org-wide average score per competency name (all scored drills). */
export async function getOrgCompetencyAverages(ctx: Ctx): Promise<Record<string, number>> {
  const rows = await db
    .select({
      name: competencyAreas.name,
      score: sql<string>`round(avg(${drillScores.normalizedScore}), 1)`,
    })
    .from(drillScores)
    .innerJoin(drills, eq(drills.id, drillScores.drillId))
    .innerJoin(competencyAreas, eq(competencyAreas.id, drillScores.competencyAreaId))
    .where(eq(drills.orgId, ctx.orgId))
    .groupBy(competencyAreas.name);
  return Object.fromEntries(rows.map((r) => [r.name, Number(r.score)]));
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
export async function getDrillCompetencyStats(ctx: Ctx, drillId: string): Promise<CompetencyStat[]> {
  if (!UUID.test(drillId)) return [];
  const [owned] = await db
    .select({ id: drills.id })
    .from(drills)
    .where(and(eq(drills.id, drillId), eq(drills.orgId, ctx.orgId)));
  if (!owned) return [];

  // Ordered timeline of this org's scored drills, oldest first.
  const timeline = await db
    .select({ drillId: drillComposites.drillId })
    .from(drillComposites)
    .innerJoin(drills, eq(drills.id, drillComposites.drillId))
    .where(eq(drills.orgId, ctx.orgId))
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

export async function listOrgUsers(ctx: Ctx) {
  return db.query.users.findMany({
    where: (u, { eq: e }) => e(u.orgId, ctx.orgId),
    orderBy: (u, { asc: up }) => [up(u.name)],
    columns: { id: true, name: true, email: true, role: true },
  });
}

/** Composite scores of the org's scored drills, oldest first, for trend charts. */
export async function getScoreTrend(ctx: Ctx) {
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
    .where(eq(drills.orgId, ctx.orgId))
    .orderBy(sql`coalesce(${drills.endedAt}, ${drillComposites.computedAt})`);
  return rows.map((r) => ({ ...r, score: Number(r.score), at: new Date(r.at) }));
}

/** Improvement actions for a single drill. */
export async function listDrillActions(ctx: Ctx, drillId: string) {
  if (!UUID.test(drillId)) return [];
  return db
    .select({
      action: improvementActions,
      owner: { id: users.id, name: users.name },
    })
    .from(improvementActions)
    .innerJoin(drills, eq(drills.id, improvementActions.drillId))
    .leftJoin(users, eq(users.id, improvementActions.ownerId))
    .where(and(eq(improvementActions.drillId, drillId), eq(drills.orgId, ctx.orgId)))
    .orderBy(asc(improvementActions.severity));
}

/** Status of each listed action (for AAR corrective-action chips), org-scoped. */
export async function getActionStatuses(ctx: Ctx, actionIds: string[]) {
  const ids = actionIds.filter((id) => UUID.test(id));
  if (!ids.length) return {};
  const rows = await db
    .select({ id: improvementActions.id, status: improvementActions.status })
    .from(improvementActions)
    .innerJoin(drills, eq(drills.id, improvementActions.drillId))
    .where(and(inArray(improvementActions.id, ids), eq(drills.orgId, ctx.orgId)));
  return Object.fromEntries(rows.map((r) => [r.id, r.status]));
}

/** A member's display name, or null if they aren't in the org. */
export async function getMemberName(ctx: Ctx, userId: string) {
  if (!UUID.test(userId)) return null;
  const [row] = await db
    .select({ name: users.name })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.orgId, ctx.orgId)));
  return row?.name ?? null;
}
