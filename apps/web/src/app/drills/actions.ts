"use server";

import { getCurrentUser } from "@/lib/current-user";
import { drillInputSchema, issuesToErrors, type DrillInput } from "@/lib/drill-form";
import {
  and,
  db,
  drillEvents,
  drillObjectives,
  drillParticipants,
  drills,
  eq,
  inArray,
  users,
  type Database,
} from "@drillforce/db";
import type { DrillStatus } from "@drillforce/shared";
import { revalidatePath } from "next/cache";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Find-or-create org users for each participant email. */
async function resolveParticipantUsers(
  tx: Tx,
  orgId: string,
  participants: { email: string; name?: string }[],
) {
  const emails = participants.map((p) => p.email);
  const existing = emails.length
    ? await tx.select().from(users).where(inArray(users.email, emails))
    : [];

  const foreign = existing.find((u) => u.orgId !== orgId);
  if (foreign) {
    throw new UserFacingError(`${foreign.email} belongs to a different organization.`);
  }

  const byEmail = new Map(existing.map((u) => [u.email, u]));
  const toCreate = participants.filter((p) => !byEmail.has(p.email));
  if (toCreate.length) {
    const created = await tx
      .insert(users)
      .values(
        toCreate.map((p) => ({
          orgId,
          email: p.email,
          name: p.name?.trim() || nameFromEmail(p.email),
          role: "participant" as const,
        })),
      )
      .returning();
    for (const u of created) byEmail.set(u.email, u);
  }
  return byEmail;
}

function nameFromEmail(email: string) {
  return email
    .split("@")[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(" ");
}

class UserFacingError extends Error {}

function statusForIntent(intent: "draft" | "schedule" | "save", current?: DrillStatus): DrillStatus {
  if (intent === "draft") return "draft";
  if (intent === "schedule") return "scheduled";
  return current ?? "draft";
}

export async function createDrill(input: DrillInput): Promise<ActionResult<{ id: string }>> {
  const parsed = drillInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: issuesToErrors(parsed.error) };
  }
  const values = parsed.data;
  if (values.intent === "schedule" && !values.scheduledAt) {
    return {
      ok: false,
      error: "Pick a date and time to schedule this drill.",
      fieldErrors: { scheduledAt: "Required to schedule" },
    };
  }

  const { user, org } = await getCurrentUser();

  try {
    const id = await db.transaction(async (tx) => {
      const status = statusForIntent(values.intent);
      const [drill] = await tx
        .insert(drills)
        .values({
          orgId: org.id,
          name: values.name,
          type: values.type,
          status,
          description: values.description || null,
          scenario: values.scenario ?? null,
          config: { sector: values.sector, templateId: values.templateId ?? null },
          scheduledAt: values.scheduledAt ? new Date(values.scheduledAt) : null,
          createdBy: user.id,
        })
        .returning({ id: drills.id });

      await tx.insert(drillObjectives).values(
        values.objectives.map((o, i) => ({
          drillId: drill.id,
          description: o.description,
          criteriaType: o.criteriaType,
          targetValue: o.targetValue,
          weight: o.weight,
          sortOrder: i,
        })),
      );

      const userMap = await resolveParticipantUsers(tx, org.id, values.participants);
      await tx.insert(drillParticipants).values(
        values.participants.map((p) => ({
          drillId: drill.id,
          userId: userMap.get(p.email)!.id,
          role: p.role,
        })),
      );

      await tx.insert(drillEvents).values({
        drillId: drill.id,
        eventType: "system",
        actor: user.id,
        payload: { kind: "status_change", from: null, to: status, text: `Drill created as ${status}` },
      });

      return drill.id;
    });

    revalidatePath("/drills");
    revalidatePath("/");
    return { ok: true, data: { id } };
  } catch (err) {
    if (err instanceof UserFacingError) return { ok: false, error: err.message };
    console.error("createDrill failed", err);
    return { ok: false, error: "Something went wrong while saving the drill." };
  }
}

export async function updateDrill(
  drillId: string,
  input: DrillInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = drillInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: issuesToErrors(parsed.error) };
  }
  const values = parsed.data;
  const { user, org } = await getCurrentUser();

  try {
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(drills)
        .where(and(eq(drills.id, drillId), eq(drills.orgId, org.id)));
      if (!current) throw new UserFacingError("Drill not found.");

      const status = statusForIntent(values.intent, current.status);
      if (status === "scheduled" && !values.scheduledAt) {
        throw new UserFacingError("Pick a date and time to schedule this drill.");
      }

      await tx
        .update(drills)
        .set({
          name: values.name,
          type: values.type,
          status,
          description: values.description || null,
          scenario: values.scenario ?? current.scenario,
          config: { ...current.config, sector: values.sector },
          scheduledAt: values.scheduledAt ? new Date(values.scheduledAt) : null,
        })
        .where(eq(drills.id, drillId));

      if (status !== current.status) {
        await tx.insert(drillEvents).values({
          drillId,
          eventType: "system",
          actor: user.id,
          payload: { kind: "status_change", from: current.status, to: status, text: `Status changed to ${status}` },
        });
      }

      // Objectives: update existing (keeps their scores), insert new, delete removed.
      const existingObjectives = await tx
        .select({ id: drillObjectives.id })
        .from(drillObjectives)
        .where(eq(drillObjectives.drillId, drillId));
      const keepIds = new Set(values.objectives.map((o) => o.id).filter(Boolean) as string[]);
      const removed = existingObjectives.filter((o) => !keepIds.has(o.id)).map((o) => o.id);
      if (removed.length) {
        await tx.delete(drillObjectives).where(inArray(drillObjectives.id, removed));
      }
      for (const [i, o] of values.objectives.entries()) {
        const row = {
          description: o.description,
          criteriaType: o.criteriaType,
          targetValue: o.targetValue,
          weight: o.weight,
          sortOrder: i,
        };
        if (o.id && existingObjectives.some((e) => e.id === o.id)) {
          await tx.update(drillObjectives).set(row).where(eq(drillObjectives.id, o.id));
        } else {
          await tx.insert(drillObjectives).values({ ...row, drillId });
        }
      }

      // Participants: sync by user.
      const userMap = await resolveParticipantUsers(tx, org.id, values.participants);
      const existingParticipants = await tx
        .select()
        .from(drillParticipants)
        .where(eq(drillParticipants.drillId, drillId));
      const wanted = new Map(values.participants.map((p) => [userMap.get(p.email)!.id, p.role]));
      const toDelete = existingParticipants.filter((p) => !wanted.has(p.userId)).map((p) => p.id);
      if (toDelete.length) {
        await tx.delete(drillParticipants).where(inArray(drillParticipants.id, toDelete));
      }
      for (const [userId, role] of wanted) {
        const match = existingParticipants.find((p) => p.userId === userId);
        if (match) {
          if (match.role !== role) {
            await tx.update(drillParticipants).set({ role }).where(eq(drillParticipants.id, match.id));
          }
        } else {
          await tx.insert(drillParticipants).values({ drillId, userId, role });
        }
      }
    });

    revalidatePath("/drills");
    revalidatePath(`/drills/${drillId}`);
    revalidatePath("/");
    return { ok: true, data: { id: drillId } };
  } catch (err) {
    if (err instanceof UserFacingError) return { ok: false, error: err.message };
    console.error("updateDrill failed", err);
    return { ok: false, error: "Something went wrong while saving the drill." };
  }
}
