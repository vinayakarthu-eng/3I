"use server";

import type { ActionResult } from "@/app/drills/actions";
import { getCurrentUser } from "@/lib/current-user";
import { createApiKey, revokeApiKey, type Ctx } from "@drillforce/core";
import { revalidatePath } from "next/cache";

async function ctx(): Promise<Ctx> {
  const { user, org } = await getCurrentUser();
  return { orgId: org.id, userId: user.id };
}

export async function createApiKeyAction(name: string): Promise<ActionResult<{ raw: string }>> {
  try {
    const { raw } = await createApiKey(await ctx(), name);
    revalidatePath("/settings");
    return { ok: true, data: { raw } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not create the key." };
  }
}

export async function revokeApiKeyAction(id: string): Promise<ActionResult> {
  try {
    await revokeApiKey(await ctx(), id);
    revalidatePath("/settings");
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not revoke the key." };
  }
}
