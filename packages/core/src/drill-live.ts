import { awardCertifications, db, drillEvents, drills, eq, evaluateDrillCompliance } from "@drillforce/db";
import { autoScoreDrill } from "@drillforce/scoring-engine";
import { z } from "zod";
import type { Ctx } from "./context";
import { loadOwnedDrill } from "./drill-writes";
import { badRequest } from "./errors";
import { flatten } from "./validation";
import { dispatchWebhookEvent } from "./webhooks";

/** Toggle the current user's readiness on the briefing page (stored in config.ready). */
export async function toggleReady(ctx: Ctx, drillId: string) {
  const drill = await loadOwnedDrill(ctx, drillId);
  const ready = new Set(((drill.config.ready as string[]) ?? []).filter(Boolean));
  if (ready.has(ctx.userId)) ready.delete(ctx.userId);
  else ready.add(ctx.userId);
  const next = [...ready];
  await db.update(drills).set({ config: { ...drill.config, ready: next } }).where(eq(drills.id, drillId));
  return { ready: next };
}

/**
 * External actor ids a client may attribute an event to (bots, agents, Slack users). Org user ids
 * aren't accepted here, so a key can't put words in a colleague's mouth — events default to the
 * key's own user.
 */
const EXTERNAL_ACTOR = /^(bot|agent:[\w-]{1,64}|slack:[\w-]{1,64})$/;

export const drillEventInput = z.object({
  type: z.enum(["message", "action", "signal", "observation"]),
  text: z.string().trim().min(1, "Text can't be empty").max(2000),
  /** Where it happened, e.g. "war-room" or "#inc-db-failover". */
  channel: z.string().trim().max(120).optional(),
  actor: z.string().regex(EXTERNAL_ACTOR, "actor must be bot, agent:<name> or slack:<id>").optional(),
  /** Display name for an external actor (shown in transcripts). */
  actorName: z.string().trim().max(120).optional(),
  /** Observations: tag + the objective they evidence. */
  tag: z.string().trim().max(50).optional(),
  objectiveId: z.string().uuid().optional(),
  occurredAt: z.string().datetime().optional(),
});
export type DrillEventInput = z.input<typeof drillEventInput>;

/** Record a message/action/signal/observation on the drill timeline. */
export async function recordDrillEvent(ctx: Ctx, drillId: string, raw: unknown) {
  const parsed = drillEventInput.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message, flatten(parsed.error));
  const input = parsed.data;
  await loadOwnedDrill(ctx, drillId);

  const payload: Record<string, unknown> = { text: input.text };
  if (input.actorName) payload.user_name = input.actorName;
  if (input.type === "observation") {
    payload.tag = input.tag ?? null;
    payload.objectiveId = input.objectiveId ?? null;
  }

  const [row] = await db
    .insert(drillEvents)
    .values({
      drillId,
      eventType: input.type,
      actor: input.actor ?? ctx.userId,
      channel: input.channel ?? null,
      payload,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
    })
    .returning();
  return row;
}

/** Re-run auto-scoring (after editing objectives or late events). */
export async function rerunAutoScoring(ctx: Ctx, drillId: string) {
  const drill = await loadOwnedDrill(ctx, drillId);
  if (!["scoring", "debriefing", "completed"].includes(drill.status)) {
    throw badRequest("Auto-scoring runs once the drill has ended.");
  }
  const result = await autoScoreDrill(drillId);
  if (result.finalized) {
    await awardCertifications(db, ctx.orgId);
    await evaluateDrillCompliance(db, ctx.orgId, drillId);
    await dispatchWebhookEvent(ctx.orgId, "drill.scored", { drillId, name: drill.name });
  }
  return { scored: result.scored, finalized: result.finalized };
}
