import { isCertEligible, type UserCertStats } from "@drillforce/shared";
import { and, eq } from "drizzle-orm";
import type { Database } from "./client";
import {
  certifications,
  competencyAreas,
  drillComposites,
  drillParticipants,
  drillScores,
  drills,
  userCertifications,
} from "./schema";

export interface CertUserStats extends UserCertStats {
  userId: string;
  drillIds: string[];
}

/** Per-user certification stats across the org's scored drills (those with a composite). */
export async function computeCertStats(
  database: Database,
  orgId: string,
): Promise<Map<string, CertUserStats>> {
  const drillRows = await database
    .select({
      userId: drillParticipants.userId,
      role: drillParticipants.role,
      drillId: drills.id,
      composite: drillComposites.compositeScore,
    })
    .from(drillParticipants)
    .innerJoin(drills, and(eq(drills.id, drillParticipants.drillId), eq(drills.orgId, orgId)))
    .innerJoin(drillComposites, eq(drillComposites.drillId, drills.id));

  const compRows = await database
    .select({
      userId: drillParticipants.userId,
      compName: competencyAreas.name,
      score: drillScores.normalizedScore,
    })
    .from(drillParticipants)
    .innerJoin(drills, and(eq(drills.id, drillParticipants.drillId), eq(drills.orgId, orgId)))
    .innerJoin(drillScores, eq(drillScores.drillId, drills.id))
    .innerJoin(competencyAreas, eq(competencyAreas.id, drillScores.competencyAreaId));

  const stats = new Map<string, CertUserStats>();
  const get = (userId: string): CertUserStats => {
    let s = stats.get(userId);
    if (!s) {
      s = { userId, drills: 0, icDrills: 0, avgScore: null, byCompetency: {}, drillIds: [] };
      stats.set(userId, s);
    }
    return s;
  };

  // Drill-level aggregates.
  const composites = new Map<string, number[]>();
  for (const r of drillRows) {
    const s = get(r.userId);
    if (!s.drillIds.includes(r.drillId)) {
      s.drillIds.push(r.drillId);
      s.drills += 1;
      if (r.role === "incident_commander") s.icDrills += 1;
      const list = composites.get(r.userId) ?? [];
      if (r.composite != null) list.push(Number(r.composite));
      composites.set(r.userId, list);
    }
  }
  for (const [userId, list] of composites) {
    const s = get(userId);
    s.avgScore = list.length ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10 : null;
  }

  // Competency aggregates.
  const comp = new Map<string, Map<string, { sum: number; n: number }>>();
  for (const r of compRows) {
    if (r.score == null) continue;
    const byName = comp.get(r.userId) ?? new Map();
    const cur = byName.get(r.compName) ?? { sum: 0, n: 0 };
    cur.sum += Number(r.score);
    cur.n += 1;
    byName.set(r.compName, cur);
    comp.set(r.userId, byName);
  }
  for (const [userId, byName] of comp) {
    const s = get(userId);
    for (const [name, { sum, n }] of byName) {
      s.byCompetency[name] = Math.round((sum / n) * 10) / 10;
    }
  }

  return stats;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * Awards any certifications the org's members newly qualify for. Idempotent:
 * skips members who already hold an active award for a certification.
 * Returns the number of certifications awarded.
 */
export async function awardCertifications(database: Database, orgId: string): Promise<number> {
  const [certs, existing, stats] = await Promise.all([
    database.select().from(certifications),
    database
      .select({ userId: userCertifications.userId, certificationId: userCertifications.certificationId })
      .from(userCertifications)
      .where(eq(userCertifications.status, "active")),
    computeCertStats(database, orgId),
  ]);

  const held = new Set(existing.map((e) => `${e.userId}:${e.certificationId}`));
  const now = new Date();
  const toInsert: (typeof userCertifications.$inferInsert)[] = [];

  for (const [userId, s] of stats) {
    for (const cert of certs) {
      if (held.has(`${userId}:${cert.id}`)) continue;
      if (!isCertEligible(cert.requirements, s)) continue;
      toInsert.push({
        userId,
        certificationId: cert.id,
        earnedAt: now,
        expiresAt: addMonths(now, cert.validForMonths),
        score: s.avgScore == null ? null : String(s.avgScore),
        drillIds: s.drillIds,
        status: "active",
      });
    }
  }

  if (toInsert.length) await database.insert(userCertifications).values(toInsert);
  return toInsert.length;
}
