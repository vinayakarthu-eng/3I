"use server";

import type { ActionResult } from "@/app/drills/actions";
import { getCurrentUser } from "@/lib/current-user";
import { db, eq, organizations } from "@drillforce/db";
import { SECTORS } from "@drillforce/shared";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const settingsSchema = z.object({
  name: z.string().trim().min(1, "Organization name is required").max(120),
  sector: z.enum(SECTORS),
  passThreshold: z.coerce.number().int().min(0).max(100),
  defaultDurationMinutes: z.coerce.number().int().min(5).max(480),
  notifications: z.object({
    drillScheduled: z.boolean(),
    drillCompleted: z.boolean(),
    actionAssigned: z.boolean(),
    actionOverdue: z.boolean(),
    certificationEarned: z.boolean(),
  }),
  competencyWeights: z.record(z.coerce.number().int().min(1).max(5)),
});

export async function updateOrgSettings(
  input: z.input<typeof settingsSchema>,
): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { org } = await getCurrentUser();
  const { name, sector, ...rest } = parsed.data;

  await db
    .update(organizations)
    .set({
      name,
      sector,
      config: {
        ...org.config,
        passThreshold: rest.passThreshold,
        defaultDurationMinutes: rest.defaultDurationMinutes,
        notifications: rest.notifications,
        competencyWeights: rest.competencyWeights,
      },
    })
    .where(eq(organizations.id, org.id));

  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true, data: null };
}
