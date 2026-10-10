import {
  and,
  asc,
  competencyAreas,
  count,
  db,
  drillComposites,
  drillParticipants,
  drills,
  drillScores,
  eq,
  sql,
} from "@drillforce/db";
import type { Ctx } from "./context";

export type ReadinessPeriod = "7d" | "30d" | "90d" | "all";

function since(period: ReadinessPeriod): Date | null {
  const days = period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : null;
  return days == null ? null : new Date(Date.now() - days * 86_400_000);
}

const drillAt = sql<Date>`coalesce(${drills.endedAt}, ${drills.createdAt})`;
const sinceFilter = (d: Date | null) => (d ? sql`${drillAt} >= ${d.toISOString()}` : undefined);

/** Team readiness: org overview + a per-member competency breakdown. */
export async function getReadiness(ctx: Ctx, periodInput?: string) {
  const period: ReadinessPeriod = ["7d", "30d", "90d", "all"].includes(periodInput ?? "")
    ? (periodInput as ReadinessPeriod)
    : "30d";
  const from = since(period);
  const clause = sinceFilter(from);

  const competencies = await db
    .select({ id: competencyAreas.id, name: competencyAreas.name })
    .from(competencyAreas)
    .orderBy(asc(competencyAreas.sortOrder));

  const [[drillAgg], [members], [coverage], memberRows] = await Promise.all([
    db
      .select({
        total: count(drillComposites.id),
        avg: sql<string | null>`round(avg(${drillComposites.compositeScore}), 1)`,
      })
      .from(drillComposites)
      .innerJoin(drills, eq(drills.id, drillComposites.drillId))
      .where(and(eq(drills.orgId, ctx.orgId), clause)),
    db
      .select({ value: sql<number>`count(distinct ${drillParticipants.userId})` })
      .from(drillParticipants)
      .innerJoin(drills, eq(drills.id, drillParticipants.drillId))
      .where(and(eq(drills.orgId, ctx.orgId), clause)),
    db
      .select({ value: sql<number>`count(distinct ${drillScores.competencyAreaId})` })
      .from(drillScores)
      .innerJoin(drills, eq(drills.id, drillScores.drillId))
      .where(and(eq(drills.orgId, ctx.orgId), clause)),
    db
      .select({
        userId: drillParticipants.userId,
        name: sql<string>`(select name from users where id = ${drillParticipants.userId})`,
        compName: competencyAreas.name,
        score: sql<string>`round(avg(${drillScores.normalizedScore}), 1)`,
      })
      .from(drillParticipants)
      .innerJoin(drills, and(eq(drills.id, drillParticipants.drillId), eq(drills.orgId, ctx.orgId)))
      .innerJoin(drillScores, eq(drillScores.drillId, drills.id))
      .innerJoin(competencyAreas, eq(competencyAreas.id, drillScores.competencyAreaId))
      .where(clause)
      .groupBy(drillParticipants.userId, competencyAreas.name),
  ]);

  const byUser = new Map<string, { userId: string; name: string; byCompetency: Record<string, number> }>();
  for (const r of memberRows) {
    let m = byUser.get(r.userId);
    if (!m) {
      m = { userId: r.userId, name: r.name, byCompetency: {} };
      byUser.set(r.userId, m);
    }
    m.byCompetency[r.compName] = Number(r.score);
  }
  const memberList = [...byUser.values()].map((m) => {
    const vals = Object.values(m.byCompetency);
    return {
      ...m,
      overall: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null,
    };
  });
  memberList.sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1));

  return {
    period,
    overview: {
      drillsRun: Number(drillAgg.total),
      averageScore: drillAgg.avg == null ? null : Number(drillAgg.avg),
      membersActive: Number(members.value),
      competencyCoverage: competencies.length
        ? Math.round((Number(coverage.value) / competencies.length) * 100)
        : 0,
    },
    competencies,
    members: memberList,
  };
}
