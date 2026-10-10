"use server";

import type { ActionResult } from "@/app/drills/actions";
import { getCurrentUser } from "@/lib/current-user";
import { and, db, drillEvents, drillInjects, drills, eq } from "@drillforce/db";
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

const messageSchema = z.string().trim().min(1, "Message can't be empty").max(2000);

export interface ChatMessage {
  id: string;
  actor: string | null;
  actorName: string;
  text: string;
  kind: "message" | "inject" | "system";
  occurredAt: string;
}

/** Post a participant chat message into the drill channel (stored as a drill_event). */
export async function postChatMessage(
  drillId: string,
  text: string,
): Promise<ActionResult<ChatMessage>> {
  const parsed = messageSchema.safeParse(text);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const ctx = await loadDrill(drillId);
  if (!ctx) return { ok: false, error: "Drill not found." };
  const { user } = ctx;

  const now = new Date();
  const [row] = await db
    .insert(drillEvents)
    .values({
      drillId,
      eventType: "message",
      actor: user.id,
      channel: "war-room",
      payload: { text: parsed.data },
      occurredAt: now,
    })
    .returning({ id: drillEvents.id });

  revalidatePath(`/drills/${drillId}/simulate`);
  return {
    ok: true,
    data: {
      id: row.id,
      actor: user.id,
      actorName: user.name,
      text: parsed.data,
      kind: "message",
      occurredAt: now.toISOString(),
    },
  };
}

/** Mark an inject as fired and record a drill_event + inject chat notification. */
export async function fireInject(drillId: string, injectId: string): Promise<ActionResult> {
  const ctx = await loadDrill(drillId);
  if (!ctx) return { ok: false, error: "Drill not found." };
  const { user } = ctx;

  const [inject] = await db
    .select()
    .from(drillInjects)
    .where(and(eq(drillInjects.id, injectId), eq(drillInjects.drillId, drillId)));
  if (!inject) return { ok: false, error: "Inject not found." };
  if (inject.fired) return { ok: true, data: null };

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(drillInjects)
      .set({ fired: true, firedAt: now })
      .where(eq(drillInjects.id, injectId));
    await tx.insert(drillEvents).values({
      drillId,
      eventType: "inject",
      actor: user.id,
      channel: "war-room",
      payload: {
        text: inject.description,
        injectType: inject.injectType,
        triggerAtMinutes: inject.triggerAtMinutes,
      },
      occurredAt: now,
    });
  });

  revalidatePath(`/drills/${drillId}/simulate`);
  revalidatePath(`/drills/${drillId}`);
  return { ok: true, data: null };
}
