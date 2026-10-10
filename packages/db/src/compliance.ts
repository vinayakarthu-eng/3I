import type { ComplianceStatus } from "@drillforce/shared";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "./client";
import {
  competencyAreas,
  complianceRequirements,
  drillComplianceEvidence,
  drillComposites,
  drillParticipants,
  drillScores,
  drills,
  userCertifications,
} from "./schema";

const DAY = 24 * 60 * 60 * 1000;

function band(value: number | null, threshold: number): ComplianceStatus {
  if (value == null) return "not_met";
  if (value >= threshold) return "met";
  if (value >= threshold - 20) return "partial";
  return "not_met";
}

/**
 * Maps a scored drill's results onto every compliance requirement and (re)writes
 * the drill's evidence rows. Idempotent per drill.
 */
export async function evaluateDrillCompliance(
  database: Database,
  orgId: string,
  drillId: string,
): Promise<number> {
  const reqs = await database.select().from(complianceRequirements);
  if (!reqs.length) return 0;

  const sinceIso = new Date(Date.now() - 365 * DAY).toISOString();
  const [[comp], compRows, [freq], [certs]] = await Promise.all([
    database
      .select({ score: drillComposites.compositeScore })
      .from(drillComposites)
      .where(eq(drillComposites.drillId, drillId)),
    database
      .select({ name: competencyAreas.name, score: sql<string>`avg(${drillScores.normalizedScore})` })
      .from(drillScores)
      .innerJoin(competencyAreas, eq(competencyAreas.id, drillScores.competencyAreaId))
      .where(eq(drillScores.drillId, drillId))
      .groupBy(competencyAreas.name),
    database
      .select({ c: sql<number>`count(*)` })
      .from(drillComposites)
      .innerJoin(drills, eq(drills.id, drillComposites.drillId))
      .where(
        and(
          eq(drills.orgId, orgId),
          sql`coalesce(${drills.endedAt}, ${drills.createdAt}) >= ${sinceIso}`,
        ),
      ),
    database
      .select({ c: sql<number>`count(*)` })
      .from(userCertifications)
      .innerJoin(drillParticipants, eq(drillParticipants.userId, userCertifications.userId))
      .where(and(eq(drillParticipants.drillId, drillId), eq(userCertifications.status, "active"))),
  ]);

  const composite = comp ? Number(comp.score) : null;
  const compMap = new Map(compRows.map((r) => [r.name, Number(r.score)]));
  const orgCount = Number(freq?.c ?? 0);
  const certCount = Number(certs?.c ?? 0);

  const rows = reqs.map((req) => {
    const cfg = req.config ?? {};
    let status: ComplianceStatus = "not_met";
    let evidence: Record<string, unknown> = {};

    switch (req.evidenceType) {
      case "drill_completion":
        status = "met";
        evidence = { note: "Drill executed, scored, and debriefed." };
        break;
      case "score_threshold": {
        const threshold = cfg.threshold ?? 70;
        status = band(composite, threshold);
        evidence = { composite, threshold };
        break;
      }
      case "competency": {
        const threshold = cfg.threshold ?? 70;
        const value = cfg.competency ? (compMap.get(cfg.competency) ?? null) : composite;
        status = band(value, threshold);
        evidence = { competency: cfg.competency ?? "composite", score: value, threshold };
        break;
      }
      case "certification":
        status = certCount > 0 ? "met" : "partial";
        evidence = { activeCertifications: certCount };
        break;
      case "frequency": {
        const minDrills = cfg.minDrills ?? 4;
        status =
          orgCount >= minDrills ? "met" : orgCount >= Math.ceil(minDrills / 2) ? "partial" : "not_met";
        evidence = { drillsInWindow: orgCount, window: "12 months", minDrills };
        break;
      }
    }
    return { drillId, requirementId: req.id, status, evidence };
  });

  await database.transaction(async (tx) => {
    await tx.delete(drillComplianceEvidence).where(eq(drillComplianceEvidence.drillId, drillId));
    if (rows.length) await tx.insert(drillComplianceEvidence).values(rows);
  });
  return rows.length;
}

/** Regenerate compliance evidence for every scored drill in the org. */
export async function evaluateOrgCompliance(database: Database, orgId: string): Promise<void> {
  const scored = await database
    .select({ id: drillComposites.drillId })
    .from(drillComposites)
    .innerJoin(drills, eq(drills.id, drillComposites.drillId))
    .where(eq(drills.orgId, orgId));
  for (const { id } of scored) {
    await evaluateDrillCompliance(database, orgId, id);
  }
}
