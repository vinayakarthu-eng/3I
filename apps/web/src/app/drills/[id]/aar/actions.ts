"use server";

import type { ActionResult } from "@/app/drills/actions";
import { discard, runCore } from "@/lib/core-action";
import {
  approveReport,
  createActionFromReport,
  generateReport as generate,
  getReport,
} from "@drillforce/core";
import { revalidatePath } from "next/cache";

function refresh(drillId: string) {
  revalidatePath(`/drills/${drillId}/aar`);
  revalidatePath(`/drills/${drillId}`);
  revalidatePath("/actions");
  revalidatePath("/reports");
}

export async function generateReport(drillId: string): Promise<ActionResult<{ generator: string }>> {
  const result = await runCore((ctx) => generate(ctx, drillId), "Couldn’t generate the report. Check the server logs.");
  if (!result.ok) return result;
  refresh(drillId);
  return { ok: true, data: { generator: result.data.generatedBy ?? "template" } };
}

export async function createActionItem(reportId: string, index: number): Promise<ActionResult<{ id: string }>> {
  const result = await runCore((ctx) => createActionFromReport(ctx, reportId, index));
  if (!result.ok) return result;
  refresh(result.data.drillId);
  return { ok: true, data: { id: result.data.id } };
}

export async function approveAar(reportId: string): Promise<ActionResult> {
  const result = await runCore(async (ctx) => {
    const report = await getReport(ctx, reportId);
    await approveReport(ctx, reportId);
    return report.drillId;
  });
  if (result.ok) refresh(result.data);
  return discard(result);
}
