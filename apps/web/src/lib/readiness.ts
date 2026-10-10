import "server-only";
import {
  and,
  asc,
  competencyAreas,
  count,
  db,
  desc,
  drillComposites,
  drillParticipants,
  drills,
  drillScores,
  eq,
  inArray,
  sql,
  users,
} from "@drillforce/db";

export type ReadinessPeriod = "7d" | "30d" | "90d" | "all";

export function periodSince(period: ReadinessPeriod): Date | null {
  const days = period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : null;
  if (days == null) return null;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** Time column used to place a drill in a period window. */
const drillAt = sql<Date>`coalesce(${drills.endedAt}, ${drills.createdAt})`;

/**
 * Period filter as a SQL fragment. We compare against an ISO string rather than
 * passing a JS Date, because the driver can't bind a Date against a coalesce()
 * expression whose type it can't infer.
 */
function sinceFilter(since: Date | null) {
  return since ? sql`${drillAt} >= ${since.toISOString()}` : undefined;
}

export interface MemberCompetency {
  score: number;
  drills: number;
}
export interface ReadinessMember {
  userId: string;
  name: string;
  role: string;
  /** competencyId -> stats */
  byCompetency: Record<string, MemberCompetency>;
  /** mean of this member's competency scores */
  overall: number | null;
}

/**
 * Per-member readiness: for each user who participated in a scored drill in the window,
 * the average competency scores across those drills.
 */
export async function getReadinessMembers(
  orgId: string,
  since: Date | null,
): Promise<ReadinessMember[]> {
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      role: users.role,
      compId: competencyAreas.id,
      score: sql<string>`round(avg(${drillScores.normalizedScore}), 1)`,
      drills: sql<number>`count(distinct ${drillScores.drillId})`,
    })
    .from(drillParticipants)
    .innerJoin(users, eq(users.id, drillParticipants.userId))
    .innerJoin(drills, and(eq(drills.id, drillParticipants.drillId), eq(drills.orgId, orgId)))
    .innerJoin(drillScores, eq(drillScores.drillId, drills.id))
    .innerJoin(competencyAreas, eq(competencyAreas.id, drillScores.competencyAreaId))
    .where(sinceFilter(since))
    .groupBy(users.id, users.name, users.role, competencyAreas.id);

  const members = new Map<string, ReadinessMember>();
  for (const r of rows) {
    let m = members.get(r.userId);
    if (!m) {
      m = { userId: r.userId, name: r.name, role: r.role, byCompetency: {}, overall: null };
      members.set(r.userId, m);
    }
    m.byCompetency[r.compId] = { score: Number(r.score), drills: Number(r.drills) };
  }
  for (const m of members.values()) {
    const vals = Object.values(m.byCompetency).map((c) => c.score);
    m.overall = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  }
  return [...members.values()].sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1));
}

export interface ReadinessOverview {
  totalDrills: number;
  avgScore: number | null;
  activeMembers: number;
  competencyCoverage: number;
}

export async function getReadinessOverview(
  orgId: string,
  since: Date | null,
  totalCompetencies: number,
): Promise<ReadinessOverview> {
  const sinceClause = sinceFilter(since);

  const [[drillAgg], [members], [coverage]] = await Promise.all([
    db
      .select({
        total: count(drillComposites.id),
        avg: sql<string | null>`round(avg(${drillComposites.compositeScore}), 1)`,
      })
      .from(drillComposites)
      .innerJoin(drills, eq(drills.id, drillComposites.drillId))
      .where(and(eq(drills.orgId, orgId), sinceClause)),
    db
      .select({ value: sql<number>`count(distinct ${drillParticipants.userId})` })
      .from(drillParticipants)
      .innerJoin(drills, eq(drills.id, drillParticipants.drillId))
      .where(and(eq(drills.orgId, orgId), sinceClause)),
    db
      .select({ value: sql<number>`count(distinct ${drillScores.competencyAreaId})` })
      .from(drillScores)
      .innerJoin(drills, eq(drills.id, drillScores.drillId))
      .where(and(eq(drills.orgId, orgId), sinceClause)),
  ]);

  return {
    totalDrills: Number(drillAgg.total),
    avgScore: drillAgg.avg == null ? null : Number(drillAgg.avg),
    activeMembers: Number(members.value),
    competencyCoverage: totalCompetencies
      ? Math.round((Number(coverage.value) / totalCompetencies) * 100)
      : 0,
  };
}

export interface TrendRow {
  drillId: string;
  name: string;
  at: Date;
  compName: string;
  score: number;
}

/** Team average competency scores across scored drills over time (for the team trends chart). */
export async function getTeamCompetencyTrend(orgId: string, since: Date | null): Promise<TrendRow[]> {
  const rows = await db
    .select({
      drillId: drills.id,
      name: drills.name,
      at: drillAt,
      compName: competencyAreas.name,
      score: sql<string>`round(avg(${drillScores.normalizedScore}), 1)`,
    })
    .from(drillScores)
    .innerJoin(drills, eq(drills.id, drillScores.drillId))
    .innerJoin(competencyAreas, eq(competencyAreas.id, drillScores.competencyAreaId))
    .where(and(eq(drills.orgId, orgId), sinceFilter(since)))
    .groupBy(drills.id, drills.name, drills.endedAt, drills.createdAt, competencyAreas.name)
    .orderBy(asc(drillAt));
  return rows.map((r) => ({ ...r, at: new Date(r.at), score: Number(r.score) }));
}

// ─── individual profile ───────────────────────────────────────────────────────

export interface UserDrillHistory {
  drillId: string;
  name: string;
  role: string;
  at: Date;
  composite: number | null;
  byCompetency: Record<string, number>;
}

export interface UserReadiness {
  user: { id: string; name: string; email: string; role: string };
  drills: UserDrillHistory[];
  byCompetency: Record<string, { score: number; drills: number }>;
}

export async function getUserReadiness(orgId: string, userId: string): Promise<UserReadiness | null> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.orgId, orgId)));
  if (!user) return null;

  const participated = await db
    .select({
      drillId: drills.id,
      name: drills.name,
      role: drillParticipants.role,
      at: drillAt,
      composite: drillComposites.compositeScore,
    })
    .from(drillParticipants)
    .innerJoin(drills, and(eq(drills.id, drillParticipants.drillId), eq(drills.orgId, orgId)))
    .leftJoin(drillComposites, eq(drillComposites.drillId, drills.id))
    .where(eq(drillParticipants.userId, userId))
    .orderBy(desc(drillAt));

  const drillIds = participated.map((d) => d.drillId);
  const compRows = drillIds.length
    ? await db
        .select({
          drillId: drillScores.drillId,
          compName: competencyAreas.name,
          score: sql<string>`round(avg(${drillScores.normalizedScore}), 1)`,
        })
        .from(drillScores)
        .innerJoin(competencyAreas, eq(competencyAreas.id, drillScores.competencyAreaId))
        .where(inArray(drillScores.drillId, drillIds))
        .groupBy(drillScores.drillId, competencyAreas.name)
    : [];

  const byDrill = new Map<string, Record<string, number>>();
  for (const r of compRows) {
    const m = byDrill.get(r.drillId) ?? {};
    m[r.compName] = Number(r.score);
    byDrill.set(r.drillId, m);
  }

  const history: UserDrillHistory[] = participated.map((d) => ({
    drillId: d.drillId,
    name: d.name,
    role: d.role,
    at: new Date(d.at),
    composite: d.composite == null ? null : Number(d.composite),
    byCompetency: byDrill.get(d.drillId) ?? {},
  }));

  // Aggregate per competency across all the user's drills.
  const agg = new Map<string, { sum: number; n: number; drills: Set<string> }>();
  for (const r of compRows) {
    const a = agg.get(r.compName) ?? { sum: 0, n: 0, drills: new Set<string>() };
    a.sum += Number(r.score);
    a.n += 1;
    a.drills.add(r.drillId);
    agg.set(r.compName, a);
  }
  const byCompetency: Record<string, { score: number; drills: number }> = {};
  for (const [name, a] of agg) {
    byCompetency[name] = { score: Math.round((a.sum / a.n) * 10) / 10, drills: a.drills.size };
  }

  return { user, drills: history, byCompetency };
}
