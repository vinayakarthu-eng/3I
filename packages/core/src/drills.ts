import {
  and,
  asc,
  db,
  desc,
  drillInjects,
  drillObjectives,
  drills,
  drillScores,
  eq,
  sql,
} from "@drillforce/db";
import type { Ctx } from "./context";
import { notFound } from "./errors";

const UUID = /^[0-9a-f-]{36}$/i;

/** Weighted composite per drill = Σ(score·weight)/Σweight; null when unscored. */
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

export interface DrillSummary {
  id: string;
  name: string;
  type: string;
  status: string;
  scheduledAt: Date | null;
  createdAt: Date;
  score: number | null;
}

export async function listDrills(ctx: Ctx, opts: { limit?: number } = {}): Promise<DrillSummary[]> {
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
    .where(eq(drills.orgId, ctx.orgId))
    .orderBy(desc(sql`coalesce(${drills.scheduledAt}, ${drills.createdAt})`));

  const rows = opts.limit ? await query.limit(opts.limit) : await query;
  return rows.map((r) => ({ ...r, score: r.score == null ? null : Number(r.score) }));
}

export async function getDrill(ctx: Ctx, id: string) {
  if (!UUID.test(id)) throw notFound("Drill");

  const drill = await db.query.drills.findFirst({
    where: (d, { and: a, eq: e }) => a(e(d.id, id), e(d.orgId, ctx.orgId)),
    with: {
      objectives: { with: { competencyArea: true }, orderBy: (o, { asc: ascAlias }) => [ascAlias(o.sortOrder)] },
      participants: { with: { user: true }, orderBy: (p, { asc: ascAlias }) => [ascAlias(p.role)] },
      composite: true,
    },
  });
  if (!drill) throw notFound("Drill");

  const [composite] = await db
    .select({ score: compositeScores.score })
    .from(compositeScores)
    .where(eq(compositeScores.drillId, id));

  return {
    id: drill.id,
    name: drill.name,
    type: drill.type,
    status: drill.status,
    description: drill.description,
    scenario: drill.scenario,
    scheduledAt: drill.scheduledAt,
    startedAt: drill.startedAt,
    endedAt: drill.endedAt,
    createdAt: drill.createdAt,
    score: composite?.score == null ? null : Number(composite.score),
    passed: drill.composite?.passed ?? null,
    passThreshold: drill.composite?.passThreshold ?? null,
    objectives: drill.objectives.map((o) => ({
      id: o.id,
      description: o.description,
      criteriaType: o.criteriaType,
      weight: o.weight,
      competency: o.competencyArea?.name ?? null,
    })),
    participants: drill.participants.map((p) => ({
      userId: p.user.id,
      name: p.user.name,
      role: p.role,
    })),
  };
}

/** Timed injects for a drill (used by the simulation/execution clients). */
export async function listDrillInjects(ctx: Ctx, drillId: string) {
  if (!UUID.test(drillId)) throw notFound("Drill");
  // Ensure the drill is in the caller's org before exposing its injects.
  const [owned] = await db
    .select({ id: drills.id })
    .from(drills)
    .where(and(eq(drills.id, drillId), eq(drills.orgId, ctx.orgId)));
  if (!owned) throw notFound("Drill");

  return db
    .select({
      id: drillInjects.id,
      description: drillInjects.description,
      triggerAtMinutes: drillInjects.triggerAtMinutes,
      injectType: drillInjects.injectType,
      payload: drillInjects.payload,
      fired: drillInjects.fired,
    })
    .from(drillInjects)
    .where(eq(drillInjects.drillId, drillId))
    .orderBy(asc(drillInjects.triggerAtMinutes), asc(drillInjects.sortOrder));
}
