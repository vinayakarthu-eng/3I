import "server-only";
// Moved into the headless core; re-exported here so existing imports keep working.
export {
  getComplianceOverview,
  getDrillComplianceEvidence,
  evaluateCompliance,
  type RequirementStatus,
  type FrameworkCompliance,
  type DrillEvidenceRow,
} from "@drillforce/core";
