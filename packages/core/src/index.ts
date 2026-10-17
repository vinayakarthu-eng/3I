export type { Ctx } from "./context";
export { ApiError, badRequest, notFound, unauthorized } from "./errors";
export { authenticateKey, generateApiKey, type GeneratedKey } from "./auth";
export { listDrills, getDrill, listDrillInjects, type DrillSummary } from "./drills";
export {
  createDrill,
  changeDrillStatus,
  fireInject,
  submitScores,
  createDrillInput,
  scoreInput,
  type CreateDrillInput,
  type ScoreInput,
} from "./drill-writes";
export { listScenarios, getScenario } from "./scenarios";
export {
  getReadiness,
  getReadinessMembers,
  getReadinessOverview,
  getTeamCompetencyTrend,
  getUserReadiness,
  periodSince,
  type ReadinessPeriod,
  type ReadinessMember,
  type ReadinessOverview,
  type MemberCompetency,
  type TrendRow,
  type UserReadiness,
  type UserDrillHistory,
} from "./readiness";
export { getDrillAnalytics, getMostImproved, type DrillAnalytics, type ImprovedUser } from "./analytics";
export {
  getComplianceOverview,
  getDrillComplianceEvidence,
  evaluateCompliance,
  type RequirementStatus,
  type FrameworkCompliance,
  type DrillEvidenceRow,
} from "./compliance";
export {
  listCertifications,
  getCertificationsOverview,
  getCertificate,
  listUserCertifications,
  evaluateCertifications,
  type CertHolder,
  type CertOverviewItem,
  type CertificateView,
} from "./certifications";
export { listCompetencyAreas, listImprovementActions } from "./org";
export { listApiKeys, createApiKey, revokeApiKey, type ApiKeyRow } from "./api-keys";
export {
  listWebhooks,
  listRecentDeliveries,
  dispatchWebhookEvent,
  sendTestDelivery,
  createWebhook,
  updateWebhook,
  setWebhookActive,
  deleteWebhook,
  redactWebhook,
  webhookInput,
  type DeliveryRow,
  type WebhookInput,
} from "./webhooks";
export {
  listReports,
  getDrillReport,
  getReport,
  generateReport,
  approveReport,
  createActionFromReport,
} from "./reports";
export {
  getOrgSettings,
  updateOrgSettings,
  orgSettingsInput,
  type OrgSettings,
  type OrgSettingsInput,
} from "./settings";
export { ENDPOINTS, openApiDocument, type Endpoint } from "./openapi";
export {
  getDashboardStats,
  getDrillDetail,
  listDrillTemplates,
  getDrillTemplate,
  getOrgCompetencyAverages,
  getDrillCompetencyStats,
  listOrgUsers,
  getScoreTrend,
  listDrillActions,
  getActionStatuses,
  getMemberName,
  type DrillDetail,
  type CompetencyStat,
} from "./views";
export { resolveDefaultActor, listOrganizations } from "./actor";
export {
  updateDrill,
  renameDrill,
  updateDrillDescription,
  updateDrillScenario,
  deleteDrill,
  duplicateDrill,
  saveObjective,
  deleteObjective,
  reorderObjectives,
  addParticipant,
  changeParticipantRole,
  removeParticipant,
  updateDrillInput,
  scenarioInput,
  type UpdateDrillInput,
} from "./drill-edits";
export {
  toggleReady,
  recordDrillEvent,
  rerunAutoScoring,
  drillEventInput,
  type DrillEventInput,
} from "./drill-live";
export { updateImprovementAction, actionUpdateInput, type ActionUpdateInput } from "./improvement-actions";
/** Cross-org operations for trusted in-process integrations (the Slack bot). Not for API handlers. */
export * as system from "./bot";
export type { EventAttribution } from "./drill-writes";
export type {
  Drill,
  DrillObjective,
  DrillInject,
  DrillTemplateRow,
  DrillReport,
  User,
  Organization,
} from "@drillforce/db";
export type { AarContent, AarSections } from "@drillforce/report-generator";
export {
  slackInstallUrl,
  completeSlackInstall,
  getSlackConnection,
  disconnectSlack,
  slackInstallMissingConfig,
  SLACK_BOT_SCOPES,
} from "./slack";
export {
  listDrillSignals,
  getInjectionPlan,
  replaceDrillSignals,
  signalPlanInput,
  signalMatrixInput,
  type SignalPlanInput,
} from "./signals";
export { scheduleDrill, executeDrill, concludeDrill, completeDrill, type ExecutionRecord } from "./lifecycle";
export { datadogLinks, telemetrySink, type TelemetrySink } from "./datadog";
export { warRoomConfigured } from "./war-room";
export { scoringDelayMinutes } from "./drill-writes";
export { signalRowToPlan } from "./signals";
