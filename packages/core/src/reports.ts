import {
  and,
  db,
  desc,
  drillComposites,
  drillReports,
  drills,
  eq,
  improvementActions,
} from "@drillforce/db";
import {
  approveReport as approveStoredReport,
  createActionFromReport as createStoredAction,
  generateAar,
  latestAar,
  type AarContent,
} from "@drillforce/report-generator";
import type { Ctx } from "./context";
import { badRequest, notFound } from "./errors";
import { dispatchWebhookEvent } from "./webhooks";

const UUID = /^[0-9a-f-]{36}$/i;
const REPORTABLE = ["scoring", "debriefing", "completed"];

async function ownedDrill(ctx: Ctx, drillId: string) {
  if (!UUID.test(drillId)) throw notFound("Drill");
  const [drill] = await db
    .select()
    .from(drills)
    .where(and(eq(drills.id, drillId), eq(drills.orgId, ctx.orgId)));
  if (!drill) throw notFound("Drill");
  return drill;
}

async function ownedReport(ctx: Ctx, reportId: string) {
  if (!UUID.test(reportId)) throw notFound("Report");
  const [row] = await db
    .select({ report: drillReports })
    .from(drillReports)
    .innerJoin(drills, eq(drills.id, drillReports.drillId))
    .where(and(eq(drillReports.id, reportId), eq(drills.orgId, ctx.orgId)));
  if (!row) throw notFound("Report");
  return row.report;
}

function actionCreatedPayload(action: typeof improvementActions.$inferSelect) {
  return {
    actionId: action.id,
    drillId: action.drillId,
    reportId: action.reportId,
    severity: action.severity,
    actionDescription: action.actionDescription,
    dueDate: action.dueDate,
  };
}

/** Latest AAR per drill (the Reports page). */
export async function listReports(ctx: Ctx) {
  const rows = await db
    .select({
      id: drillReports.id,
      drillId: drills.id,
      drillName: drills.name,
      drillType: drills.type,
      generatedBy: drillReports.generatedBy,
      generatedAt: drillReports.generatedAt,
      approvedAt: drillReports.approvedAt,
      composite: drillComposites.compositeScore,
      passed: drillComposites.passed,
    })
    .from(drillReports)
    .innerJoin(drills, eq(drills.id, drillReports.drillId))
    .leftJoin(drillComposites, eq(drillComposites.drillId, drills.id))
    .where(and(eq(drills.orgId, ctx.orgId), eq(drillReports.reportType, "aar")))
    .orderBy(desc(drillReports.generatedAt));
  const seen = new Set<string>();
  return rows
    .filter((r) => (seen.has(r.drillId) ? false : (seen.add(r.drillId), true)))
    .map((r) => ({ ...r, composite: r.composite == null ? null : Number(r.composite) }));
}

/** The drill's most recent AAR, or null if none has been generated. */
export async function getDrillReport(ctx: Ctx, drillId: string) {
  await ownedDrill(ctx, drillId);
  return latestAar(drillId);
}

export async function getReport(ctx: Ctx, reportId: string) {
  return ownedReport(ctx, reportId);
}

/**
 * Generate a new AAR (Claude, or the template without an API key). The first AAR for a drill
 * auto-creates improvement actions, each announced as `action.created`.
 */
export async function generateReport(ctx: Ctx, drillId: string) {
  const drill = await ownedDrill(ctx, drillId);
  if (!REPORTABLE.includes(drill.status)) {
    throw badRequest("An AAR can be generated once the drill has ended.");
  }
  const report = await generateAar(drillId);
  const created = await db.select().from(improvementActions).where(eq(improvementActions.reportId, report.id));
  for (const action of created) {
    await dispatchWebhookEvent(ctx.orgId, "action.created", actionCreatedPayload(action));
  }
  return report;
}

export async function approveReport(ctx: Ctx, reportId: string) {
  const report = await ownedReport(ctx, reportId);
  if (report.approvedAt) throw badRequest("This report is already approved.");
  return approveStoredReport(reportId, ctx.userId);
}

/** Create (once) the improvement action for corrective action #index of a report. */
export async function createActionFromReport(ctx: Ctx, reportId: string, index: number) {
  const report = await ownedReport(ctx, reportId);
  const content = report.content as unknown as AarContent;
  if (!Number.isInteger(index) || !content.correctiveActions?.[index]) {
    throw badRequest("Corrective action not found.");
  }
  const existed = !!content.meta?.actionIds?.[String(index)];
  const action = await createStoredAction(reportId, index);
  if (!existed) await dispatchWebhookEvent(ctx.orgId, "action.created", actionCreatedPayload(action));
  return action;
}
