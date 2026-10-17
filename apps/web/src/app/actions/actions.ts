"use server";

import type { ActionResult } from "@/app/drills/actions";
import { runCore } from "@/lib/core-action";
import { updateImprovementAction as update, type ActionUpdateInput } from "@drillforce/core";
import { revalidatePath } from "next/cache";

export type ActionUpdate = ActionUpdateInput;

export async function updateImprovementAction(id: string, input: ActionUpdate): Promise<ActionResult> {
  const result = await runCore((ctx) => update(ctx, id, input));
  if (!result.ok) return result;
  revalidatePath("/actions");
  revalidatePath(`/drills/${result.data.drillId}/aar`);
  revalidatePath("/");
  return { ok: true, data: null };
}
