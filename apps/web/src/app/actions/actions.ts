"use server";

import type { ActionResult } from "@/app/drills/actions";
import { getCurrentUser } from "@/lib/current-user";
import { and, db, drills, eq, improvementActions, users } from "@drillforce/db";
import {
  ACTION_CATEGORIES,
  ACTION_SEVERITIES,
  ACTION_STATUS_LABELS,
  ACTION_STATUSES,
  allowedActionTransitions,
} from "@drillforce/shared";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const updateSchema = z.object({
  actionDescription: z.string().trim().min(1, "Describe the action").max(2000),
  gapDescription: z.string().trim().min(1, "Describe the gap").max(2000),
  category: z.enum(ACTION_CATEGORIES).nullable(),
  severity: z.enum(ACTION_SEVERITIES),
  ownerId: z.string().uuid().nullable(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date")
    .nullable(),
  verificationMethod: z.string().trim().max(2000).nullable(),
  status: z.enum(ACTION_STATUSES),
  deferralJustification: z.string().trim().max(2000).nullable(),
});

export type ActionUpdate = z.input<typeof updateSchema>;

export async function updateImprovementAction(id: string, input: ActionUpdate): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const values = parsed.data;
  const { org } = await getCurrentUser();

  const [row] = await db
    .select({ action: improvementActions })
    .from(improvementActions)
    .innerJoin(drills, eq(drills.id, improvementActions.drillId))
    .where(and(eq(improvementActions.id, id), eq(drills.orgId, org.id)));
  if (!row) return { ok: false, error: "Action not found." };
  const current = row.action;

  if (values.status !== current.status && !allowedActionTransitions(current.status).includes(values.status)) {
    return {
      ok: false,
      error: `Can’t move from ${ACTION_STATUS_LABELS[current.status]} to ${ACTION_STATUS_LABELS[values.status]}.`,
    };
  }
  if (values.status === "deferred" && !values.deferralJustification) {
    return { ok: false, error: "Explain why this action is being deferred." };
  }
  if (values.ownerId) {
    const [owner] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, values.ownerId), eq(users.orgId, org.id)));
    if (!owner) return { ok: false, error: "Owner must be a member of your organization." };
  }

  await db
    .update(improvementActions)
    .set({
      ...values,
      verificationMethod: values.verificationMethod || null,
      deferralJustification: values.status === "deferred" ? values.deferralJustification : current.deferralJustification,
      verifiedAt:
        values.status === "verified" ? (current.verifiedAt ?? new Date()) : values.status === current.status ? current.verifiedAt : null,
    })
    .where(eq(improvementActions.id, id));

  revalidatePath("/actions");
  revalidatePath(`/drills/${current.drillId}/aar`);
  revalidatePath("/");
  return { ok: true, data: null };
}
