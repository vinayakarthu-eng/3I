"use server";

import type { ActionResult } from "@/app/drills/actions";
import { discard, runCore } from "@/lib/core-action";
import { updateOrgSettings as saveOrgSettings, type OrgSettingsInput } from "@drillforce/core";
import { revalidatePath } from "next/cache";

export async function updateOrgSettings(input: OrgSettingsInput): Promise<ActionResult> {
  const result = await runCore((ctx) => saveOrgSettings(ctx, input));
  if (result.ok) {
    revalidatePath("/settings");
    revalidatePath("/");
  }
  return discard(result);
}
