"use server";

import type { ActionResult } from "@/app/drills/actions";
import { evaluateCertifications } from "@/lib/certifications";
import { evaluateCompliance } from "@/lib/compliance";
import { getCurrentUser } from "@/lib/current-user";
import { dispatchWebhookEvent } from "@/lib/webhooks";
import { and, db, drillEvents, drills, eq } from "@drillforce/db";
import { autoScoreDrill } from "@drillforce/scoring-engine";
import { DRILL_STATUS_LABELS } from "@drillforce/shared";
import { revalidatePath } from "next/cache";
import { z } from "zod";

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
  revalidatePath(`/drills/${drillId}/briefing`);
  revalidatePath(`/drills/${drillId}/live`);
}

const notFound = { ok: false as const, error: "Drill not found." };

/** Toggle the current user's readiness on the briefing page (stored in config.ready). */
export async function toggleReady(drillId: string): Promise<ActionResult<{ ready: string[] }>> {
  const ctx = await loadDrill(drillId);
  if (!ctx) return notFound;
  const { drill, user } = ctx;
  const ready = new Set(((drill.config.ready as string[]) ?? []).filter(Boolean));
  if (ready.has(user.id)) ready.delete(user.id);
  else ready.add(user.id);
  const next = [...ready];
  await db.update(drills).set({ config: { ...drill.config, ready: next } }).where(eq(drills.id, drillId));
  refresh(drillId);
  return { ok: true, data: { ready: next } };
}

/** Move a briefing drill into active execution. */
export async function startDrill(drillId: string): Promise<ActionResult> {
  const ctx = await loadDrill(drillId);
  if (!ctx) return notFound;
  const { drill, user } = ctx;
  if (drill.status !== "briefing") {
    return { ok: false, error: `Drill is ${DRILL_STATUS_LABELS[drill.status]}, not Briefing.` };
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(drills)
      .set({ status: "active", startedAt: drill.startedAt ?? now })
      .where(eq(drills.id, drillId));
    await tx.insert(drillEvents).values({
      drillId,
      eventType: "system",
      actor: user.id,
      payload: { kind: "status_change", from: "briefing", to: "active", text: "Drill started" },
      occurredAt: now,
    });
  });
  await dispatchWebhookEvent(ctx.org.id, "drill.started", { drillId, name: drill.name });
  refresh(drillId);
  return { ok: true, data: null };
}

/** End an active drill: move to scoring, run auto-scoring, and re-evaluate certs/compliance. */
export async function endDrill(drillId: string): Promise<ActionResult> {
  const ctx = await loadDrill(drillId);
  if (!ctx) return notFound;
  const { drill, user, org } = ctx;
  if (drill.status !== "active") {
    return { ok: false, error: `Drill is ${DRILL_STATUS_LABELS[drill.status]}, not Active.` };
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(drills)
      .set({ status: "scoring", endedAt: drill.endedAt ?? now })
      .where(eq(drills.id, drillId));
    await tx.insert(drillEvents).values({
      drillId,
      eventType: "system",
      actor: user.id,
      payload: { kind: "status_change", from: "active", to: "scoring", text: "Drill ended" },
      occurredAt: now,
    });
  });

  await dispatchWebhookEvent(org.id, "drill.ended", { drillId, name: drill.name });
  try {
    const result = await autoScoreDrill(drillId);
    if (result.finalized) {
      await evaluateCertifications(org.id);
      await evaluateCompliance(org.id, drillId);
      await dispatchWebhookEvent(org.id, "drill.scored", { drillId, name: drill.name });
    }
  } catch (err) {
    console.error("auto-scoring after endDrill failed", err);
  }

  refresh(drillId);
  return { ok: true, data: null };
}

const observationSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  objectiveId: z.string().uuid().optional(),
  tag: z.string().max(50).optional(),
});

/** Record an observer/evaluator annotation as an `observation` drill event. */
export async function recordObservation(
  drillId: string,
  input: z.input<typeof observationSchema>,
): Promise<ActionResult> {
  const parsed = observationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Observation can't be empty." };
  const ctx = await loadDrill(drillId);
  if (!ctx) return notFound;
  const { user } = ctx;
  await db.insert(drillEvents).values({
    drillId,
    eventType: "observation",
    actor: user.id,
    channel: "war-room",
    payload: {
      text: parsed.data.text,
      tag: parsed.data.tag ?? null,
      objectiveId: parsed.data.objectiveId ?? null,
    },
    occurredAt: new Date(),
  });
  refresh(drillId);
  return { ok: true, data: null };
}
