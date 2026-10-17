"use server";

import type { ActionResult } from "@/app/drills/actions";
import { discard, runCore } from "@/lib/core-action";
import { issuesToErrors, objectiveSchema, participantSchema } from "@/lib/drill-form";
import * as core from "@drillforce/core";
import { DRILL_STATUSES, type DrillStatus, type ParticipantRole } from "@drillforce/shared";
import { revalidatePath } from "next/cache";
import type { z } from "zod";

function refresh(drillId: string) {
  revalidatePath(`/drills/${drillId}`);
  revalidatePath("/drills");
  revalidatePath("/");
}

/** Run a core edit on one drill and refresh its pages on success. */
async function edit<T>(drillId: string, fn: (ctx: core.Ctx) => Promise<T>): Promise<ActionResult> {
  const result = await runCore(fn);
  if (result.ok) refresh(drillId);
  return discard(result);
}

// ─── drill fields ───────────────────────────────────────────────────────────

/** Header status menu. Same path as the API: entering Scoring auto-scores, and webhooks fire. */
export async function changeDrillStatus(drillId: string, to: DrillStatus): Promise<ActionResult> {
  if (!DRILL_STATUSES.includes(to)) return { ok: false, error: "Unknown status." };
  return edit(drillId, (ctx) => core.changeDrillStatus(ctx, drillId, to));
}

export async function renameDrill(drillId: string, name: string): Promise<ActionResult> {
  return edit(drillId, (ctx) => core.renameDrill(ctx, drillId, name));
}

export async function updateDrillDescription(drillId: string, description: string): Promise<ActionResult> {
  return edit(drillId, (ctx) => core.updateDrillDescription(ctx, drillId, description));
}

export async function updateDrillScenario(drillId: string, json: string): Promise<ActionResult> {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return { ok: false, error: "Scenario must be valid JSON." };
  }
  return edit(drillId, (ctx) => core.updateDrillScenario(ctx, drillId, value));
}

export async function deleteDrill(drillId: string): Promise<ActionResult> {
  const result = await runCore((ctx) => core.deleteDrill(ctx, drillId));
  if (result.ok) {
    revalidatePath("/drills");
    revalidatePath("/");
  }
  return discard(result);
}

export async function duplicateDrill(drillId: string): Promise<ActionResult<{ id: string }>> {
  const result = await runCore((ctx) => core.duplicateDrill(ctx, drillId));
  if (result.ok) {
    revalidatePath("/drills");
    revalidatePath("/");
  }
  return result;
}

// ─── objectives ─────────────────────────────────────────────────────────────

export async function saveObjective(drillId: string, input: z.input<typeof objectiveSchema>): Promise<ActionResult> {
  // The form schema validates criteria-specific targets with field-level messages first.
  const parsed = objectiveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: issuesToErrors(parsed.error) };
  }
  return edit(drillId, (ctx) => core.saveObjective(ctx, drillId, parsed.data));
}

export async function deleteObjective(drillId: string, objectiveId: string): Promise<ActionResult> {
  return edit(drillId, (ctx) => core.deleteObjective(ctx, drillId, objectiveId));
}

export async function reorderObjectives(drillId: string, orderedIds: string[]): Promise<ActionResult> {
  return edit(drillId, (ctx) => core.reorderObjectives(ctx, drillId, orderedIds));
}

// ─── participants ───────────────────────────────────────────────────────────

export async function addParticipant(
  drillId: string,
  input: { email: string; name?: string; role: ParticipantRole },
): Promise<ActionResult> {
  const parsed = participantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  return edit(drillId, (ctx) => core.addParticipant(ctx, drillId, parsed.data));
}

export async function changeParticipantRole(
  drillId: string,
  participantId: string,
  role: ParticipantRole,
): Promise<ActionResult> {
  return edit(drillId, (ctx) => core.changeParticipantRole(ctx, drillId, participantId, role));
}

export async function removeParticipant(drillId: string, participantId: string): Promise<ActionResult> {
  return edit(drillId, (ctx) => core.removeParticipant(ctx, drillId, participantId));
}
