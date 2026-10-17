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
import { DRILL_STATUS_LABELS, DRILL_TYPES, PARTICIPANT_ROLES, SECTORS, type ParticipantRole } from "@drillforce/shared";
import { z } from "zod";
import type { Ctx } from "./context";
import {
  loadOwnedDrill,
  nameFromEmail,
  objectiveInput,
  participantInput,
  resolveParticipants,
} from "./drill-writes";
import { badRequest, notFound } from "./errors";
import { flatten } from "./validation";

const UUID = /^[0-9a-f-]{36}$/i;

function parse<T extends z.ZodTypeAny>(schema: T, raw: unknown, message: string): z.output<T> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw badRequest(message, flatten(parsed.error));
  return parsed.data;
}

// ─── full edit (the wizard's "save") ─────────────────────────────────────────
export const updateDrillInput = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(DRILL_TYPES),
  sector: z.enum(SECTORS).optional(),
  description: z.string().trim().max(5000).nullish(),
  scheduledAt: z.string().datetime().nullish(),
  scenario: z.record(z.unknown()).nullish(),
  /** Omit to keep the current status. Only draft ⇄ scheduled can be set here. */
  status: z.enum(["draft", "scheduled"]).optional(),
  /** Full replacement: objectives with an `id` are updated (keeping scores), others created, missing ones deleted. */
  objectives: z.array(objectiveInput.extend({ id: z.string().uuid().optional() })),
  /** Full replacement, matched by email. */
  participants: z.array(participantInput),
});
export type UpdateDrillInput = z.input<typeof updateDrillInput>;

export async function updateDrill(ctx: Ctx, drillId: string, raw: unknown) {
  const input = parse(updateDrillInput, raw, "Invalid drill payload.");
  await loadOwnedDrill(ctx, drillId);

  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(drills).where(eq(drills.id, drillId)).for("update");
    const status = input.status ?? current.status;
    if (status !== current.status && !["draft", "scheduled"].includes(current.status)) {
      throw badRequest(`A drill in ${DRILL_STATUS_LABELS[current.status]} can't be moved back to ${DRILL_STATUS_LABELS[status]}.`);
    }
    if (status === "scheduled" && !input.scheduledAt) {
      throw badRequest("Pick a date and time to schedule this drill.", { scheduledAt: "Required to schedule" });
    }

    await tx
      .update(drills)
      .set({
        name: input.name,
        type: input.type,
        status,
        description: input.description || null,
        scenario: (input.scenario ?? current.scenario) as typeof drills.$inferInsert.scenario,
        config: { ...current.config, ...(input.sector ? { sector: input.sector } : {}) },
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      })
      .where(eq(drills.id, drillId));

    if (status !== current.status) {
      await tx.insert(drillEvents).values({
        drillId,
        eventType: "system",
        actor: ctx.userId,
        payload: { kind: "status_change", from: current.status, to: status, text: `Status changed to ${status}` },
      });
    }

    // Objectives: update existing (keeps their scores), insert new, delete removed.
    const existingObjectives = await tx
      .select({ id: drillObjectives.id })
      .from(drillObjectives)
      .where(eq(drillObjectives.drillId, drillId));
    const keepIds = new Set(input.objectives.map((o) => o.id).filter(Boolean) as string[]);
    const removed = existingObjectives.filter((o) => !keepIds.has(o.id)).map((o) => o.id);
    if (removed.length) {
      await tx.delete(drillObjectives).where(inArray(drillObjectives.id, removed));
    }
    for (const [i, o] of input.objectives.entries()) {
      const row = {
        description: o.description,
        criteriaType: o.criteriaType,
        targetValue: o.targetValue as typeof drillObjectives.$inferInsert.targetValue,
        weight: o.weight,
        ...(o.competencyAreaId !== undefined ? { competencyAreaId: o.competencyAreaId } : {}),
        sortOrder: i,
      };
      if (o.id && existingObjectives.some((e) => e.id === o.id)) {
        await tx.update(drillObjectives).set(row).where(eq(drillObjectives.id, o.id));
      } else {
        await tx.insert(drillObjectives).values({ ...row, drillId });
      }
    }

    // Participants: sync by user.
    const userMap = await resolveParticipants(tx, ctx.orgId, input.participants);
    const existingParticipants = await tx
      .select()
      .from(drillParticipants)
      .where(eq(drillParticipants.drillId, drillId));
    const wanted = new Map(input.participants.map((p) => [userMap.get(p.email)!.id, p.role]));
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

  return { id: drillId };
}

// ─── single fields ───────────────────────────────────────────────────────────
export async function renameDrill(ctx: Ctx, drillId: string, name: string) {
  const value = parse(z.string().trim().min(1, "Name can't be empty").max(200), name, "Name can't be empty");
  await loadOwnedDrill(ctx, drillId);
  await db.update(drills).set({ name: value }).where(eq(drills.id, drillId));
  return { id: drillId };
}

export async function updateDrillDescription(ctx: Ctx, drillId: string, description: string) {
  const value = parse(z.string().max(5000), description, "Description is too long.");
  await loadOwnedDrill(ctx, drillId);
  await db.update(drills).set({ description: value.trim() || null }).where(eq(drills.id, drillId));
  return { id: drillId };
}

export const scenarioInput = z
  .object({
    summary: z.string().optional(),
    injects: z.array(z.object({ at_minute: z.number().min(0), description: z.string().min(1) })).optional(),
    expected_actions: z.array(z.string()).optional(),
  })
  .passthrough();

export async function updateDrillScenario(ctx: Ctx, drillId: string, scenario: unknown) {
  const parsed = scenarioInput.safeParse(scenario);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw badRequest(`${issue.path.join(".") || "scenario"}: ${issue.message}`);
  }
  await loadOwnedDrill(ctx, drillId);
  await db
    .update(drills)
    .set({ scenario: parsed.data as typeof drills.$inferInsert.scenario })
    .where(eq(drills.id, drillId));
  return { id: drillId };
}

export async function deleteDrill(ctx: Ctx, drillId: string) {
  await loadOwnedDrill(ctx, drillId);
  // Child rows (objectives, participants, events, scores, actions) cascade.
  await db.delete(drills).where(eq(drills.id, drillId));
  return { id: drillId, deleted: true as const };
}

export async function duplicateDrill(ctx: Ctx, drillId: string) {
  const drill = await loadOwnedDrill(ctx, drillId);
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
        createdBy: ctx.userId,
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
      actor: ctx.userId,
      payload: { kind: "status_change", from: null, to: "draft", text: `Duplicated from “${drill.name}”` },
    });
    return copy.id;
  });
  return { id };
}

// ─── objectives ──────────────────────────────────────────────────────────────
const saveObjectiveInput = objectiveInput.extend({ id: z.string().uuid().optional() });

/** Create (no id) or update (id) one objective. */
export async function saveObjective(ctx: Ctx, drillId: string, raw: unknown) {
  const { id, ...values } = parse(saveObjectiveInput, raw, "Please fix the highlighted fields.");
  await loadOwnedDrill(ctx, drillId);
  const row = {
    ...values,
    targetValue: values.targetValue as typeof drillObjectives.$inferInsert.targetValue,
    competencyAreaId: values.competencyAreaId ?? null,
  };

  if (id) {
    const result = await db
      .update(drillObjectives)
      .set(row)
      .where(and(eq(drillObjectives.id, id), eq(drillObjectives.drillId, drillId)))
      .returning({ id: drillObjectives.id });
    if (!result.length) throw notFound("Objective");
    return { id };
  }
  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${drillObjectives.sortOrder}) + 1, 0)` })
    .from(drillObjectives)
    .where(eq(drillObjectives.drillId, drillId));
  const [created] = await db
    .insert(drillObjectives)
    .values({ ...row, drillId, sortOrder: Number(next) })
    .returning({ id: drillObjectives.id });
  return { id: created.id };
}

export async function deleteObjective(ctx: Ctx, drillId: string, objectiveId: string) {
  await loadOwnedDrill(ctx, drillId);
  if (!UUID.test(objectiveId)) throw notFound("Objective");
  await db
    .delete(drillObjectives)
    .where(and(eq(drillObjectives.id, objectiveId), eq(drillObjectives.drillId, drillId)));
  return { id: objectiveId, deleted: true as const };
}

export async function reorderObjectives(ctx: Ctx, drillId: string, orderedIds: unknown) {
  const ids = parse(z.array(z.string().uuid()), orderedIds, "Invalid order.");
  await loadOwnedDrill(ctx, drillId);
  await db.transaction(async (tx) => {
    const existing = ids.length
      ? await tx
          .select({ id: drillObjectives.id })
          .from(drillObjectives)
          .where(and(eq(drillObjectives.drillId, drillId), inArray(drillObjectives.id, ids)))
      : [];
    const valid = new Set(existing.map((e) => e.id));
    for (const [i, id] of ids.entries()) {
      if (valid.has(id)) {
        await tx.update(drillObjectives).set({ sortOrder: i }).where(eq(drillObjectives.id, id));
      }
    }
  });
  return { id: drillId };
}

// ─── participants ────────────────────────────────────────────────────────────
export async function addParticipant(ctx: Ctx, drillId: string, raw: unknown) {
  const parsed = participantInput.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message, flatten(parsed.error));
  await loadOwnedDrill(ctx, drillId);
  const { email, name, role } = parsed.data;

  return db.transaction(async (tx) => {
    let [member] = await tx.select().from(users).where(eq(users.email, email));
    if (member && member.orgId !== ctx.orgId) throw badRequest(`${email} belongs to a different organization.`);
    if (!member) {
      [member] = await tx
        .insert(users)
        .values({ orgId: ctx.orgId, email, name: name?.trim() || nameFromEmail(email), role: "participant" })
        .returning();
    }
    const [existing] = await tx
      .select({ id: drillParticipants.id })
      .from(drillParticipants)
      .where(and(eq(drillParticipants.drillId, drillId), eq(drillParticipants.userId, member.id)));
    if (existing) throw badRequest(`${member.name} is already a participant.`);

    const [row] = await tx
      .insert(drillParticipants)
      .values({ drillId, userId: member.id, role })
      .returning({ id: drillParticipants.id });
    return { id: row.id, userId: member.id };
  });
}

export async function changeParticipantRole(ctx: Ctx, drillId: string, participantId: string, role: ParticipantRole) {
  if (!PARTICIPANT_ROLES.includes(role)) throw badRequest("Unknown role.");
  await loadOwnedDrill(ctx, drillId);
  if (!UUID.test(participantId)) throw notFound("Participant");
  await db
    .update(drillParticipants)
    .set({ role })
    .where(and(eq(drillParticipants.id, participantId), eq(drillParticipants.drillId, drillId)));
  return { id: participantId };
}

export async function removeParticipant(ctx: Ctx, drillId: string, participantId: string) {
  await loadOwnedDrill(ctx, drillId);
  if (!UUID.test(participantId)) throw notFound("Participant");
  await db
    .delete(drillParticipants)
    .where(and(eq(drillParticipants.id, participantId), eq(drillParticipants.drillId, drillId)));
  return { id: participantId, deleted: true as const };
}
