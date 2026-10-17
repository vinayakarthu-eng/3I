"use server";

import type { ActionResult } from "@/app/drills/actions";
import { runCore } from "@/lib/core-action";
import { rerunAutoScoring as rerun, submitScores, type ScoreInput } from "@drillforce/core";
import { revalidatePath } from "next/cache";

function refresh(drillId: string) {
  revalidatePath(`/drills/${drillId}`);
  revalidatePath("/drills");
  revalidatePath("/");
}

export async function submitManualScores(
  drillId: string,
  input: ScoreInput,
): Promise<ActionResult<{ finalized: boolean; composite: number | null }>> {
  const result = await runCore((ctx) => submitScores(ctx, drillId, input));
  if (result.ok) refresh(drillId);
  return result;
}

export async function rerunAutoScoring(drillId: string): Promise<ActionResult<{ scored: number }>> {
  const result = await runCore((ctx) => rerun(ctx, drillId), "Auto-scoring failed. Check the server logs.");
  if (!result.ok) return result;
  refresh(drillId);
  return { ok: true, data: { scored: result.data.scored } };
}
