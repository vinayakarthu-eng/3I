"use server";

import type { ActionResult } from "@/app/drills/actions";
import { getCurrentUser } from "@/lib/current-user";
import { objectiveSchema, participantSchema, issuesToErrors } from "@/lib/drill-form";
import {
  and,
  asc,
  db,
  drillEvents,
  drillObjectives,
  drillParticipants,
  drills,
  eq,
  inArray,
  sql,
  users,
} from "@drillforce/db";
import {
  canTransition,
  DRILL_STATUS_LABELS,
  DRILL_STATUSES,
  PARTICIPANT_ROLES,
  type DrillStatus,
  type ParticipantRole,
} from "@drillforce/shared";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// ─── helpers ────────────────────────────────────────────────────────────────

async function loadDrill(drillId: string) {
  const { user, org } = await getCurrentUser();
  if (!z.string().uuid().safeParse(drillId).success) return null;
  const [drill] = await db
    .select()
    .from(drills)
    .where(and(eq(drills.id, drillId), eq(drills.orgId, org.id)));
  return drill ? { drill, user, org } : null;
}

function refresh(drillId: string) {
  revalidatePath(`/drills/${drillId}`);
  revalidatePath("/drills");
  revalidatePath("/");
}

const notFound = { ok: false as const, error: "Drill not found." };
const ok = { ok: true as const, data: null };

// ─── drill fields ───────────────────────────────────────────────────────────

export async function changeDrillStatus(drillId: string, to: DrillStatus): Promise<ActionResult> {
  const ctx = await loadDrill(drillId);
  if (!ctx) return notFound;
  const { drill, user } = ctx;
  if (!DRILL_STATUSES.includes(to)) return { ok: false, error: "Unknown status." };
  if (!canTransition(drill.status, to)) {
    return {
      ok: false,
      error: `Can't move from ${DRILL_STATUS_LABELS[drill.status]} to ${DRILL_STATUS_LABELS[to]}.`,
    };
  }
  if (to === "scheduled" && !drill.scheduledAt) {
    return { ok: false, error: "Set a scheduled date before scheduling this drill (Edit Drill)." };
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(drills)
      .set({
        status: to,
        ...(to === "active" && !drill.startedAt ? { startedAt: now } : {}),
        ...(to === "scoring" && !drill.endedAt ? { endedAt: now } : {}),
      })
      .where(eq(drills.id, drillId));
    await tx.insert(drillEvents).values({
      drillId,
      eventType: "system",
      actor: user.id,
      payload: {
        kind: "status_change",
        from: drill.status,
        to,
        text: `Status changed from ${DRILL_STATUS_LABELS[drill.status]} to ${DRILL_STATUS_LABELS[to]}`,
      },
      occurredAt: now,
    });
  });
  refresh(drillId);
  return ok;
}

export async function renameDrill(drillId: string, name: string): Promise<ActionResult> {
  const parsed = z.string().trim().min(1, "Name can't be empty").max(200).safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const ctx = await loadDrill(drillId);
  if (!ctx) return notFound;
  await db.update(drills).set({ name: parsed.data }).where(eq(drills.id, drillId));
  refresh(drillId);
  return ok;
}

export async function updateDrillDescription(drillId: string, description: string): Promise<ActionResult> {
  const parsed = z.string().max(5000).safeParse(description);
  if (!parsed.success) return { ok: false, error: "Description is too long." };
  const ctx = await loadDrill(drillId);
  if (!ctx) return notFound;
  await db
    .update(drills)
    .set({ description: parsed.data.trim() || null })
    .where(eq(drills.id, drillId));
  refresh(drillId);
  return ok;
}

const scenarioSchema = z
  .object({
    summary: z.string().optional(),
    injects: z
      .array(z.object({ at_minute: z.number().min(0), description: z.string().min(1) }))
      .optional(),
    expected_actions: z.array(z.string()).optional(),
  })
  .passthrough();

export async function updateDrillScenario(drillId: string, json: string): Promise<ActionResult> {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return { ok: false, error: "Scenario must be valid JSON." };
  }
  const parsed = scenarioSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue.path.join(".") || "scenario"}: ${issue.message}` };
  }
  const ctx = await loadDrill(drillId);
  if (!ctx) return notFound;
  await db.update(drills).set({ scenario: parsed.data }).where(eq(drills.id, drillId));
  refresh(drillId);
  return ok;
}

export async function deleteDrill(drillId: string): Promise<ActionResult> {
  const ctx = await loadDrill(drillId);
  if (!ctx) return notFound;
  // Child rows (objectives, participants, events, scores, actions) cascade.
  await db.delete(drills).where(eq(drills.id, drillId));
  revalidatePath("/drills");
  revalidatePath("/");
  return ok;
}

export async function duplicateDrill(drillId: string): Promise<ActionResult<{ id: string }>> {
  const ctx = await loadDrill(drillId);
  if (!ctx) return notFound;
  const { drill, user } = ctx;

  const id = await db.transaction(async (tx) => {
    const [copy] = await tx
      .insert(drills)
      .values({
        orgId: drill.orgId,
        name: `${drill.name} (copy)`,
        type: drill.type,
        status: "draft",
        description: drill.description,
        scenario: drill.scenario,
        config: drill.config,
        createdBy: user.id,
      })
      .returning({ id: drills.id });

    const objectives = await tx
      .select()
      .from(drillObjectives)
      .where(eq(drillObjectives.drillId, drillId))
      .orderBy(asc(drillObjectives.sortOrder));
    if (objectives.length) {
      await tx.insert(drillObjectives).values(
        objectives.map(({ id: _id, drillId: _drillId, ...o }) => ({ ...o, drillId: copy.id })),
      );
    }
    await tx.insert(drillEvents).values({
      drillId: copy.id,
      eventType: "system",
      actor: user.id,
      payload: { kind: "status_change", from: null, to: "draft", text: `Duplicated from “${drill.name}”` },
    });
    return copy.id;
  });

  revalidatePath("/drills");
  revalidatePath("/");
  return { ok: true, data: { id } };
}

// ─── objectives ─────────────────────────────────────────────────────────────

export async function saveObjective(
  drillId: string,
  input: z.input<typeof objectiveSchema>,
): Promise<ActionResult> {
  const parsed = objectiveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: issuesToErrors(parsed.error) };
  }
  const ctx = await loadDrill(drillId);
  if (!ctx) return notFound;
  const { id, ...values } = parsed.data;

  if (id) {
    const result = await db
      .update(drillObjectives)
      .set(values)
      .where(and(eq(drillObjectives.id, id), eq(drillObjectives.drillId, drillId)))
      .returning({ id: drillObjectives.id });
    if (!result.length) return { ok: false, error: "Objective not found." };
  } else {
    const [{ next }] = await db
      .select({ next: sql<number>`coalesce(max(${drillObjectives.sortOrder}) + 1, 0)` })
      .from(drillObjectives)
      .where(eq(drillObjectives.drillId, drillId));
    await db.insert(drillObjectives).values({ ...values, drillId, sortOrder: Number(next) });
  }
  refresh(drillId);
  return ok;
}

export async function deleteObjective(drillId: string, objectiveId: string): Promise<ActionResult> {
  const ctx = await loadDrill(drillId);
  if (!ctx) return notFound;
  await db
    .delete(drillObjectives)
    .where(and(eq(drillObjectives.id, objectiveId), eq(drillObjectives.drillId, drillId)));
  refresh(drillId);
  return ok;
}

export async function reorderObjectives(drillId: string, orderedIds: string[]): Promise<ActionResult> {
  const ctx = await loadDrill(drillId);
  if (!ctx) return notFound;
  const ids = z.array(z.string().uuid()).safeParse(orderedIds);
  if (!ids.success) return { ok: false, error: "Invalid order." };

  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: drillObjectives.id })
      .from(drillObjectives)
      .where(and(eq(drillObjectives.drillId, drillId), inArray(drillObjectives.id, ids.data)));
    const valid = new Set(existing.map((e) => e.id));
    for (const [i, id] of ids.data.entries()) {
      if (valid.has(id)) {
        await tx.update(drillObjectives).set({ sortOrder: i }).where(eq(drillObjectives.id, id));
      }
    }
  });
  refresh(drillId);
  return ok;
}

// ─── participants ───────────────────────────────────────────────────────────

export async function addParticipant(
  drillId: string,
  input: { email: string; name?: string; role: ParticipantRole },
): Promise<ActionResult> {
  const parsed = participantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const ctx = await loadDrill(drillId);
  if (!ctx) return notFound;
  const { org } = ctx;
  const { email, name, role } = parsed.data;

  return db.transaction(async (tx) => {
    let [member] = await tx.select().from(users).where(eq(users.email, email));
    if (member && member.orgId !== org.id) {
      return { ok: false as const, error: `${email} belongs to a different organization.` };
    }
    if (!member) {
      [member] = await tx
        .insert(users)
        .values({
          orgId: org.id,
          email,
          name: name || email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          role: "participant",
        })
        .returning();
    }
    const [existing] = await tx
      .select({ id: drillParticipants.id })
      .from(drillParticipants)
      .where(and(eq(drillParticipants.drillId, drillId), eq(drillParticipants.userId, member.id)));
    if (existing) return { ok: false as const, error: `${member.name} is already a participant.` };

    await tx.insert(drillParticipants).values({ drillId, userId: member.id, role });
    refresh(drillId);
    return ok;
  });
}

export async function changeParticipantRole(
  drillId: string,
  participantId: string,
  role: ParticipantRole,
): Promise<ActionResult> {
  if (!PARTICIPANT_ROLES.includes(role)) return { ok: false, error: "Unknown role." };
  const ctx = await loadDrill(drillId);
  if (!ctx) return notFound;
  await db
    .update(drillParticipants)
    .set({ role })
    .where(and(eq(drillParticipants.id, participantId), eq(drillParticipants.drillId, drillId)));
  refresh(drillId);
  return ok;
}

export async function removeParticipant(drillId: string, participantId: string): Promise<ActionResult> {
  const ctx = await loadDrill(drillId);
  if (!ctx) return notFound;
  await db
    .delete(drillParticipants)
    .where(and(eq(drillParticipants.id, participantId), eq(drillParticipants.drillId, drillId)));
  refresh(drillId);
  return ok;
}
