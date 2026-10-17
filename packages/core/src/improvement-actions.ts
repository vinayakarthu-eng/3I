import { and, db, drills, eq, improvementActions, users } from "@drillforce/db";
import {
  ACTION_CATEGORIES,
  ACTION_SEVERITIES,
  ACTION_STATUS_LABELS,
  ACTION_STATUSES,
  allowedActionTransitions,
} from "@drillforce/shared";
import { z } from "zod";
import type { Ctx } from "./context";
import { badRequest, notFound } from "./errors";
import { flatten } from "./validation";

const UUID = /^[0-9a-f-]{36}$/i;

export const actionUpdateInput = z.object({
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
export type ActionUpdateInput = z.input<typeof actionUpdateInput>;

/** Replace an improvement action's editable fields, enforcing the status workflow. */
export async function updateImprovementAction(ctx: Ctx, id: string, raw: unknown) {
  const parsed = actionUpdateInput.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message, flatten(parsed.error));
  const values = parsed.data;
  if (!UUID.test(id)) throw notFound("Action");

  const [row] = await db
    .select({ action: improvementActions })
    .from(improvementActions)
    .innerJoin(drills, eq(drills.id, improvementActions.drillId))
    .where(and(eq(improvementActions.id, id), eq(drills.orgId, ctx.orgId)));
  if (!row) throw notFound("Action");
  const current = row.action;

  if (values.status !== current.status && !allowedActionTransitions(current.status).includes(values.status)) {
    throw badRequest(
      `Can’t move from ${ACTION_STATUS_LABELS[current.status]} to ${ACTION_STATUS_LABELS[values.status]}.`,
    );
  }
  if (values.status === "deferred" && !values.deferralJustification) {
    throw badRequest("Explain why this action is being deferred.");
  }
  if (values.ownerId) {
    const [owner] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, values.ownerId), eq(users.orgId, ctx.orgId)));
    if (!owner) throw badRequest("Owner must be a member of your organization.");
  }

  const [updated] = await db
    .update(improvementActions)
    .set({
      ...values,
      verificationMethod: values.verificationMethod || null,
      deferralJustification: values.status === "deferred" ? values.deferralJustification : current.deferralJustification,
      verifiedAt:
        values.status === "verified"
          ? (current.verifiedAt ?? new Date())
          : values.status === current.status
            ? current.verifiedAt
            : null,
    })
    .where(eq(improvementActions.id, id))
    .returning();
  return updated;
}
