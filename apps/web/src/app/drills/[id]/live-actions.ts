"use server";

import type { ActionResult } from "@/app/drills/actions";
import { discard, runCore } from "@/lib/core-action";
import { changeDrillStatus, recordDrillEvent, toggleReady as toggle } from "@drillforce/core";
import { revalidatePath } from "next/cache";

function refresh(drillId: string) {
  revalidatePath(`/drills/${drillId}`);
  revalidatePath(`/drills/${drillId}/briefing`);
  revalidatePath(`/drills/${drillId}/live`);
}

/** Toggle the current user's readiness on the briefing page (stored in config.ready). */
export async function toggleReady(drillId: string): Promise<ActionResult<{ ready: string[] }>> {
  const result = await runCore((ctx) => toggle(ctx, drillId));
  if (result.ok) refresh(drillId);
  return result;
}

/** Move a briefing drill into active execution. */
export async function startDrill(drillId: string): Promise<ActionResult> {
  const result = await runCore((ctx) => changeDrillStatus(ctx, drillId, "active"));
  if (result.ok) refresh(drillId);
  return discard(result);
}

/** End an active drill: move to scoring, run auto-scoring, and re-evaluate certs/compliance. */
export async function endDrill(drillId: string): Promise<ActionResult> {
  const result = await runCore((ctx) => changeDrillStatus(ctx, drillId, "scoring"));
  if (result.ok) refresh(drillId);
  return discard(result);
}

/** Record an observer/evaluator annotation as an `observation` drill event. */
export async function recordObservation(
  drillId: string,
  input: { text: string; objectiveId?: string; tag?: string },
): Promise<ActionResult> {
  const result = await runCore((ctx) =>
    recordDrillEvent(ctx, drillId, { type: "observation", channel: "war-room", ...input }),
  );
  if (result.ok) refresh(drillId);
  if (!result.ok && result.fieldErrors?.text) return { ok: false, error: "Observation can't be empty." };
  return discard(result);
}
