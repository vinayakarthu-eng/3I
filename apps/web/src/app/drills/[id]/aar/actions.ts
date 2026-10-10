"use server";

import type { ActionResult } from "@/app/drills/actions";
import { getCurrentUser } from "@/lib/current-user";
import { and, db, drillReports, drills, eq } from "@drillforce/db";
import { approveReport, createActionFromReport, generateAar } from "@drillforce/report-generator";
import { revalidatePath } from "next/cache";
import { z } from "zod";

async function ownedDrill(drillId: string) {
  const { user, org } = await getCurrentUser();
  if (!z.string().uuid().safeParse(drillId).success) return null;
  const [drill] = await db
    .select()
    .from(drills)
    .where(and(eq(drills.id, drillId), eq(drills.orgId, org.id)));
  return drill ? { drill, user } : null;
}

async function ownedReport(reportId: string) {
  if (!z.string().uuid().safeParse(reportId).success) return null;
  const [report] = await db.select().from(drillReports).where(eq(drillReports.id, reportId));
  if (!report) return null;
  const ctx = await ownedDrill(report.drillId);
  return ctx ? { ...ctx, report } : null;
}

function refresh(drillId: string) {
  revalidatePath(`/drills/${drillId}/aar`);
  revalidatePath(`/drills/${drillId}`);
  revalidatePath("/actions");
  revalidatePath("/reports");
}

export async function generateReport(drillId: string): Promise<ActionResult<{ generator: string }>> {
  const ctx = await ownedDrill(drillId);
  if (!ctx) return { ok: false, error: "Drill not found." };
  if (!["scoring", "debriefing", "completed"].includes(ctx.drill.status)) {
    return { ok: false, error: "An AAR can be generated once the drill has ended." };
  }
  try {
    const report = await generateAar(drillId);
    refresh(drillId);
    return { ok: true, data: { generator: report.generatedBy ?? "template" } };
  } catch (err) {
    console.error("generateReport failed", err);
    return { ok: false, error: "Couldn’t generate the report. Check the server logs." };
  }
}

export async function createActionItem(reportId: string, index: number): Promise<ActionResult<{ id: string }>> {
  const ctx = await ownedReport(reportId);
  if (!ctx) return { ok: false, error: "Report not found." };
  try {
    const action = await createActionFromReport(reportId, index);
    refresh(ctx.report.drillId);
    return { ok: true, data: { id: action.id } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function approveAar(reportId: string): Promise<ActionResult> {
  const ctx = await ownedReport(reportId);
  if (!ctx) return { ok: false, error: "Report not found." };
  if (ctx.report.approvedAt) return { ok: false, error: "This report is already approved." };
  await approveReport(reportId, ctx.user.id);
  refresh(ctx.report.drillId);
  return { ok: true, data: null };
}
