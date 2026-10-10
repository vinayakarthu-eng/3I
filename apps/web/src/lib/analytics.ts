import "server-only";
import {
  and,
  asc,
  competencyAreas,
  db,
  drillComposites,
  drillEvents,
  drillParticipants,
  drills,
  drillScores,
  eq,
  inArray,
  sql,
  users,
} from "@drillforce/db";

const drillAt = sql<Date>`coalesce(${drills.endedAt}, ${drills.createdAt})`;

export interface DrillAnalytics {
  id: string;
  name: string;
  type: string;
  scenarioType: string | null;
  at: Date;
  composite: number;
  ttrMins: number | null;
  ttfrMins: number | null;
  events: number;
  byCompetency: Record<string, number>;
}

/** All scored drills with time-to-resolution / first-response and competency scores. */
export async function getDrillAnalytics(orgId: string): Promise<DrillAnalytics[]> {
  const base = await db
    .select({
      id: drills.id,
      name: drills.name,
      type: drills.type,
      scenario: drills.scenario,
      startedAt: drills.startedAt,
      endedAt: drills.endedAt,
      createdAt: drills.createdAt,
      composite: drillComposites.compositeScore,
    })
    .from(drillComposites)
    .innerJoin(drills, eq(drills.id, drillComposites.drillId))
    .where(eq(drills.orgId, orgId))
    .orderBy(asc(drillAt));

  if (base.length === 0) return [];
  const ids = base.map((b) => b.id);

  const [eventCounts, firstResponses, compRows] = await Promise.all([
    db
      .select({ drillId: drillEvents.drillId, c: sql<number>`count(*)` })
      .from(drillEvents)
      .where(inArray(drillEvents.drillId, ids))
      .groupBy(drillEvents.drillId),
    db
      .select({ drillId: drillEvents.drillId, first: sql<Date>`min(${drillEvents.occurredAt})` })
      .from(drillEvents)
      .where(and(inArray(drillEvents.drillId, ids), inArray(drillEvents.eventType, ["message", "action"])))
      .groupBy(drillEvents.drillId),
    db
      .select({
        drillId: drillScores.drillId,
        name: competencyAreas.name,
        score: sql<string>`round(avg(${drillScores.normalizedScore}), 1)`,
      })
      .from(drillScores)
      .innerJoin(competencyAreas, eq(competencyAreas.id, drillScores.competencyAreaId))
      .where(inArray(drillScores.drillId, ids))
      .groupBy(drillScores.drillId, competencyAreas.name),
  ]);

  const eventMap = new Map(eventCounts.map((e) => [e.drillId, Number(e.c)]));
  const firstMap = new Map(firstResponses.map((f) => [f.drillId, new Date(f.first)]));
  const compMap = new Map<string, Record<string, number>>();
  for (const r of compRows) {
    const m = compMap.get(r.drillId) ?? {};
    m[r.name] = Number(r.score);
    compMap.set(r.drillId, m);
  }

  const mins = (a: Date | null, b: Date | null) =>
    a && b ? Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000)) : null;

  return base.map((b) => {
    const started = b.startedAt ? new Date(b.startedAt) : null;
    const ended = b.endedAt ? new Date(b.endedAt) : null;
    const first = firstMap.get(b.id) ?? null;
    return {
      id: b.id,
      name: b.name,
      type: b.type,
      scenarioType: (b.scenario as { scenarioType?: string } | null)?.scenarioType ?? null,
      at: new Date(b.endedAt ?? b.createdAt),
      composite: Number(b.composite),
      ttrMins: mins(started, ended),
      ttfrMins: mins(started, first),
      events: eventMap.get(b.id) ?? 0,
      byCompetency: compMap.get(b.id) ?? {},
    };
  });
}

export interface ImprovedUser {
  userId: string;
  name: string;
  delta: number;
  latest: number;
}

/** Users with the biggest composite-score increase across their recent drills. */
export async function getMostImproved(orgId: string): Promise<ImprovedUser[]> {
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      composite: drillComposites.compositeScore,
      at: drillAt,
    })
    .from(drillParticipants)
    .innerJoin(users, eq(users.id, drillParticipants.userId))
    .innerJoin(drills, and(eq(drills.id, drillParticipants.drillId), eq(drills.orgId, orgId)))
    .innerJoin(drillComposites, eq(drillComposites.drillId, drills.id))
    .orderBy(asc(drillAt));

  const byUser = new Map<string, { name: string; scores: number[] }>();
  for (const r of rows) {
    const u = byUser.get(r.userId) ?? { name: r.name, scores: [] };
    u.scores.push(Number(r.composite));
    byUser.set(r.userId, u);
  }

  const improved: ImprovedUser[] = [];
  for (const [userId, u] of byUser) {
    if (u.scores.length < 2) continue;
    const recent = u.scores.slice(-3);
    const delta = Math.round((recent[recent.length - 1] - recent[0]) * 10) / 10;
    improved.push({ userId, name: u.name, delta, latest: recent[recent.length - 1] });
  }
  return improved.sort((a, b) => b.delta - a.delta);
}
