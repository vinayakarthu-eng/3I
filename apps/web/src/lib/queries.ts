import "server-only";
// Read models live in the headless core; these keep the web app's (orgId, …) call signatures.
import * as core from "@drillforce/core";
import { currentCtx } from "@/lib/core-action";

export type { CompetencyStat, DrillDetail } from "@drillforce/core";

const scoped = async (orgId: string): Promise<core.Ctx> => ({ ...(await currentCtx()), orgId });

export type DrillListItem = core.DrillSummary;

export async function listDrills(orgId: string, limit?: number) {
  return core.listDrills(await scoped(orgId), { limit });
}

export async function getDashboardStats(orgId: string) {
  return core.getDashboardStats(await scoped(orgId));
}

export async function getDrill(orgId: string, id: string) {
  return core.getDrillDetail(await scoped(orgId), id);
}

/** Timed injects for a drill (empty when it isn't in the current org). */
export async function listDrillInjects(drillId: string) {
  try {
    return await core.listDrillInjects(await currentCtx(), drillId);
  } catch (err) {
    if (err instanceof core.ApiError && err.status === 404) return [];
    throw err;
  }
}

export const listDrillTemplates = core.listDrillTemplates;
export const getDrillTemplate = core.getDrillTemplate;
export const listCompetencyAreas = core.listCompetencyAreas;

export async function getOrgCompetencyAverages(orgId: string) {
  return core.getOrgCompetencyAverages(await scoped(orgId));
}

export async function getDrillCompetencyStats(orgId: string, drillId: string) {
  return core.getDrillCompetencyStats(await scoped(orgId), drillId);
}

export async function listOrgUsers(orgId: string) {
  return core.listOrgUsers(await scoped(orgId));
}

export async function getScoreTrend(orgId: string) {
  return core.getScoreTrend(await scoped(orgId));
}

export async function listImprovementActions(orgId: string) {
  return core.listImprovementActions(await scoped(orgId));
}

export type ImprovementActionRow = Awaited<ReturnType<typeof listImprovementActions>>[number];

/** Improvement actions for a single drill. */
export async function listDrillActions(drillId: string) {
  return core.listDrillActions(await currentCtx(), drillId);
}

/** Latest AAR per drill for the Reports page. */
export async function listReports(orgId: string) {
  return core.listReports(await scoped(orgId));
}

/** The drill's injection plan (signals described + expected telemetry), empty outside the org. */
export async function getInjectionPlan(drillId: string) {
  try {
    return await core.getInjectionPlan(await currentCtx(), drillId);
  } catch (err) {
    if (err instanceof core.ApiError && err.status === 404) return null;
    throw err;
  }
}
