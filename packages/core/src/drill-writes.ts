import {
  and,
  awardCertifications,
  db,
  drillEvents,
  drillInjects,
  drillObjectives,
  drillParticipants,
  drills,
  drillTemplates,
  eq,
  evaluateDrillCompliance,
  inArray,
  users,
} from "@drillforce/db";
import {
  CRITERIA_TYPES,
  DRILL_STATUS_LABELS,
  DRILL_TYPES,
  PARTICIPANT_ROLES,
  canTransition,
  type DrillStatus,
} from "@drillforce/shared";
import { autoScoreDrill, recordManualScores } from "@drillforce/scoring-engine";
import { z } from "zod";
import type { Ctx } from "./context";
import { badRequest, notFound } from "./errors";

const UUID = /^[0-9a-f-]{36}$/i;

function nameFromEmail(email: string) {
  return email
    .split("@")[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(" ");
}

// ─── create ─────────────────────────────────────────────────────────────────
const objectiveInput = z.object({
  description: z.string().trim().min(1).max(1000),
  criteriaType: z.enum(CRITERIA_TYPES),
  targetValue: z.record(z.unknown()).default({}),
  weight: z.coerce.number().int().min(1).max(5).default(1),
  competencyAreaId: z.string().uuid().nullish(),
});
const participantInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().optional(),
  role: z.enum(PARTICIPANT_ROLES).default("responder"),
});
const createDrillInput = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(DRILL_TYPES).optional(),
  description: z.string().trim().max(5000).optional(),
  scheduledAt: z.string().datetime().optional(),
  scenario: z.record(z.unknown()).optional(),
  templateId: z.string().optional(),
  status: z.enum(["draft", "scheduled"]).default("draft"),
  objectives: z.array(objectiveInput).optional(),
  participants: z.array(participantInput).default([]),
});
export type CreateDrillInput = z.input<typeof createDrillInput>;

export async function createDrill(ctx: Ctx, raw: unknown): Promise<{ id: string }> {
  const parsed = createDrillInput.safeParse(raw);
  if (!parsed.success) {
    throw badRequest("Invalid drill payload.", flatten(parsed.error));
  }
  const input = parsed.data;

  // Pull defaults from a template when referenced.
  let template: typeof drillTemplates.$inferSelect | undefined;
  if (input.templateId) {
    [template] = await db.select().from(drillTemplates).where(eq(drillTemplates.id, input.templateId));
    if (!template) throw notFound("Scenario template");
  }

  const type = input.type ?? template?.type;
  if (!type) throw badRequest("`type` is required (or provide a templateId).");
  if (input.status === "scheduled" && !input.scheduledAt) {
    throw badRequest("`scheduledAt` is required to schedule a drill.", { scheduledAt: "Required" });
  }

  const objectives =
    input.objectives ??
    (template?.objectives ?? []).map((o) => ({
      description: o.description,
      criteriaType: o.criteriaType,
      targetValue: o.targetValue,
      weight: o.weight,
      competencyAreaId: null,
    }));

  const id = await db.transaction(async (tx) => {
    const [drill] = await tx
      .insert(drills)
      .values({
        orgId: ctx.orgId,
        name: input.name,
        type,
        status: input.status,
        description: input.description ?? null,
        scenario: (input.scenario ?? template?.scenario ?? null) as typeof drills.$inferInsert.scenario,
        config: { templateId: input.templateId ?? null, sector: template?.sector },
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        createdBy: ctx.userId,
      })
      .returning({ id: drills.id });

    if (objectives.length) {
      await tx.insert(drillObjectives).values(
        objectives.map((o, i) => ({
          drillId: drill.id,
          description: o.description,
          criteriaType: o.criteriaType,
          targetValue: o.targetValue as typeof drillObjectives.$inferInsert.targetValue,
          weight: o.weight,
          competencyAreaId: o.competencyAreaId ?? null,
          sortOrder: i,
        })),
      );
    }

    if (input.participants.length) {
      const byEmail = await resolveParticipants(tx, ctx.orgId, input.participants);
      await tx.insert(drillParticipants).values(
        input.participants.map((p) => ({ drillId: drill.id, userId: byEmail.get(p.email)!.id, role: p.role })),
      );
    }

    await tx.insert(drillEvents).values({
      drillId: drill.id,
      eventType: "system",
      actor: ctx.userId,
      payload: { kind: "status_change", from: null, to: input.status, text: `Drill created as ${input.status}` },
    });
    return drill.id;
  });

  return { id };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function resolveParticipants(
  tx: Tx,
  orgId: string,
  participants: { email: string; name?: string }[],
) {
  const emails = participants.map((p) => p.email);
  const existing = emails.length ? await tx.select().from(users).where(inArray(users.email, emails)) : [];
  const foreign = existing.find((u) => u.orgId !== orgId);
  if (foreign) throw badRequest(`${foreign.email} belongs to a different organization.`);

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

// ─── status transitions ───────────────────────────────────────────────────────
async function loadOwnedDrill(ctx: Ctx, id: string) {
  if (!UUID.test(id)) throw notFound("Drill");
  const [drill] = await db
    .select()
    .from(drills)
    .where(and(eq(drills.id, id), eq(drills.orgId, ctx.orgId)));
  if (!drill) throw notFound("Drill");
  return drill;
}

export async function changeDrillStatus(ctx: Ctx, id: string, to: DrillStatus) {
  const drill = await loadOwnedDrill(ctx, id);
  if (!canTransition(drill.status, to)) {
    throw badRequest(`Can't move from ${DRILL_STATUS_LABELS[drill.status]} to ${DRILL_STATUS_LABELS[to]}.`);
  }
  if (to === "scheduled" && !drill.scheduledAt) {
    throw badRequest("Set a scheduled date before scheduling this drill.");
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
      .where(eq(drills.id, id));
    await tx.insert(drillEvents).values({
      drillId: id,
      eventType: "system",
      actor: ctx.userId,
      payload: {
        kind: "status_change",
        from: drill.status,
        to,
        text: `Status changed from ${DRILL_STATUS_LABELS[drill.status]} to ${DRILL_STATUS_LABELS[to]}`,
      },
      occurredAt: now,
    });
  });

  // Entering scoring: auto-score and re-evaluate certs/compliance (same as ending a live drill).
  if (to === "scoring") {
    try {
      const result = await autoScoreDrill(id);
      if (result.finalized) {
        await awardCertifications(db, ctx.orgId);
        await evaluateDrillCompliance(db, ctx.orgId, id);
      }
    } catch (err) {
      console.error("auto-scoring after status change failed", err);
    }
  }

  return { id, status: to };
}

// ─── fire inject ──────────────────────────────────────────────────────────────
export async function fireInject(ctx: Ctx, drillId: string, injectId: string) {
  await loadOwnedDrill(ctx, drillId);
  if (!UUID.test(injectId)) throw notFound("Inject");
  const [inject] = await db
    .select()
    .from(drillInjects)
    .where(and(eq(drillInjects.id, injectId), eq(drillInjects.drillId, drillId)));
  if (!inject) throw notFound("Inject");
  if (inject.fired) return { id: injectId, fired: true };

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(drillInjects).set({ fired: true, firedAt: now }).where(eq(drillInjects.id, injectId));
    await tx.insert(drillEvents).values({
      drillId,
      eventType: "inject",
      actor: ctx.userId,
      channel: "api",
      payload: { text: inject.description, injectType: inject.injectType, triggerAtMinutes: inject.triggerAtMinutes },
      occurredAt: now,
    });
  });
  return { id: injectId, fired: true };
}

// ─── submit scores ────────────────────────────────────────────────────────────
const scoreInput = z.array(
  z.object({
    objectiveId: z.string().uuid(),
    notes: z.string().max(5000).optional(),
    ratings: z
      .array(z.object({ dimension: z.string().min(1), rating: z.number().int().min(1), scale: z.number().int().min(2).max(10) }))
      .optional(),
    verdict: z.enum(["correct", "partial", "incorrect"]).optional(),
  }),
);

export async function submitScores(ctx: Ctx, drillId: string, raw: unknown) {
  const drill = await loadOwnedDrill(ctx, drillId);
  if (drill.status !== "scoring" && drill.status !== "debriefing") {
    throw badRequest("Scores can only be submitted while the drill is in Scoring or Debriefing.");
  }
  const parsed = scoreInput.safeParse(raw);
  if (!parsed.success) throw badRequest("Invalid scores payload.", flatten(parsed.error));

  const result = await recordManualScores(drillId, ctx.userId, parsed.data);
  if (result) {
    await awardCertifications(db, ctx.orgId);
    await evaluateDrillCompliance(db, ctx.orgId, drillId);
  }
  return { finalized: !!result, composite: result?.composite ?? null };
}

function flatten(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[issue.path.join(".") || "_"] = issue.message;
  return out;
}
