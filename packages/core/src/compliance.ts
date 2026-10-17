import {
  and,
  asc,
  complianceFrameworks,
  complianceRequirements,
  db,
  drillComplianceEvidence,
  drills,
  eq,
  evaluateDrillCompliance,
} from "@drillforce/db";
import type { ComplianceStatus } from "@drillforce/shared";

const STATUS_RANK: Record<ComplianceStatus, number> = { not_met: 0, partial: 1, met: 2 };
const STATUS_WEIGHT: Record<ComplianceStatus, number> = { not_met: 0, partial: 0.5, met: 1 };

export interface RequirementStatus {
  id: string;
  clause: string;
  description: string;
  evidenceType: string;
  status: ComplianceStatus;
  lastEvidenceAt: Date | null;
  evidenceCount: number;
}

export interface FrameworkCompliance {
  id: string;
  name: string;
  version: string;
  description: string;
  requirements: RequirementStatus[];
  /** 0..100 percent of requirements met (partial counts half). */
  score: number;
}

export async function getComplianceOverview(orgId: string): Promise<FrameworkCompliance[]> {
  const [frameworks, requirements, evidence] = await Promise.all([
    db.select().from(complianceFrameworks).orderBy(asc(complianceFrameworks.sortOrder)),
    db
      .select()
      .from(complianceRequirements)
      .orderBy(asc(complianceRequirements.frameworkId), asc(complianceRequirements.sortOrder)),
    db
      .select({
        requirementId: drillComplianceEvidence.requirementId,
        status: drillComplianceEvidence.status,
        assessedAt: drillComplianceEvidence.assessedAt,
      })
      .from(drillComplianceEvidence)
      .innerJoin(drills, eq(drills.id, drillComplianceEvidence.drillId))
      .where(eq(drills.orgId, orgId)),
  ]);

  const byReq = new Map<string, { status: ComplianceStatus; last: Date | null; count: number }>();
  for (const e of evidence) {
    const cur = byReq.get(e.requirementId) ?? { status: "not_met" as ComplianceStatus, last: null, count: 0 };
    cur.count += 1;
    if (STATUS_RANK[e.status] > STATUS_RANK[cur.status]) cur.status = e.status;
    const at = new Date(e.assessedAt);
    if (!cur.last || at > cur.last) cur.last = at;
    byReq.set(e.requirementId, cur);
  }

  return frameworks.map((fw) => {
    const reqs = requirements
      .filter((r) => r.frameworkId === fw.id)
      .map((r) => {
        const agg = byReq.get(r.id);
        return {
          id: r.id,
          clause: r.clause,
          description: r.description,
          evidenceType: r.evidenceType,
          status: agg?.status ?? ("not_met" as ComplianceStatus),
          lastEvidenceAt: agg?.last ?? null,
          evidenceCount: agg?.count ?? 0,
        };
      });
    const score = reqs.length
      ? Math.round((reqs.reduce((a, r) => a + STATUS_WEIGHT[r.status], 0) / reqs.length) * 100)
      : 0;
    return { ...fw, requirements: reqs, score };
  });
}

export interface DrillEvidenceRow {
  framework: string;
  version: string;
  clause: string;
  description: string;
  status: ComplianceStatus;
  evidence: Record<string, unknown>;
}

export async function getDrillComplianceEvidence(
  orgId: string,
  drillId: string,
): Promise<DrillEvidenceRow[]> {
  if (!/^[0-9a-f-]{36}$/i.test(drillId)) return [];
  return db
    .select({
      framework: complianceFrameworks.name,
      version: complianceFrameworks.version,
      clause: complianceRequirements.clause,
      description: complianceRequirements.description,
      status: drillComplianceEvidence.status,
      evidence: drillComplianceEvidence.evidence,
    })
    .from(drillComplianceEvidence)
    .innerJoin(drills, and(eq(drills.id, drillComplianceEvidence.drillId), eq(drills.orgId, orgId)))
    .innerJoin(complianceRequirements, eq(complianceRequirements.id, drillComplianceEvidence.requirementId))
    .innerJoin(complianceFrameworks, eq(complianceFrameworks.id, complianceRequirements.frameworkId))
    .where(eq(drillComplianceEvidence.drillId, drillId))
    .orderBy(asc(complianceFrameworks.sortOrder), asc(complianceRequirements.sortOrder)) as Promise<
    DrillEvidenceRow[]
  >;
}

/** Regenerate compliance evidence for a single drill (called after scoring finalizes). */
export async function evaluateCompliance(orgId: string, drillId: string) {
  return evaluateDrillCompliance(db, orgId, drillId);
}
