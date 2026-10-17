"use server";

import type { ActionResult } from "@/app/drills/actions";
import { discard, runCore } from "@/lib/core-action";
import { getCurrentUser } from "@/lib/current-user";
import { fireInject as fire, recordDrillEvent } from "@drillforce/core";
import { revalidatePath } from "next/cache";

export interface ChatMessage {
  id: string;
  actor: string | null;
  actorName: string;
  text: string;
  kind: "message" | "inject" | "system";
  occurredAt: string;
}

/** Post a participant chat message into the drill channel (stored as a drill_event). */
export async function postChatMessage(drillId: string, text: string): Promise<ActionResult<ChatMessage>> {
  const result = await runCore((ctx) => recordDrillEvent(ctx, drillId, { type: "message", text, channel: "war-room" }));
  if (!result.ok) return result.fieldErrors?.text ? { ok: false, error: "Message can't be empty" } : result;

  revalidatePath(`/drills/${drillId}/simulate`);
  const { user } = await getCurrentUser();
  const row = result.data;
  return {
    ok: true,
    data: {
      id: row.id,
      actor: row.actor,
      actorName: user.name,
      text: String(row.payload.text ?? ""),
      kind: "message",
      occurredAt: row.occurredAt.toISOString(),
    },
  };
}

/** Mark an inject as fired and record a drill_event + inject chat notification. */
export async function fireInject(drillId: string, injectId: string): Promise<ActionResult> {
  const result = await runCore((ctx) => fire(ctx, drillId, injectId, { channel: "war-room" }));
  if (result.ok) {
    revalidatePath(`/drills/${drillId}/simulate`);
    revalidatePath(`/drills/${drillId}`);
  }
  return discard(result);
}
