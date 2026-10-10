import { db, drillEvents } from "@drillforce/db";
import type { EventType } from "@drillforce/shared";

export async function logEvent(input: {
  drillId: string;
  eventType: EventType;
  actor: string;
  channel?: string;
  payload: Record<string, unknown>;
  occurredAt?: Date;
}) {
  await db.insert(drillEvents).values({
    drillId: input.drillId,
    eventType: input.eventType,
    actor: input.actor,
    channel: input.channel ?? null,
    payload: input.payload,
    occurredAt: input.occurredAt ?? new Date(),
  });
}

/** Slack message timestamps ("1712345678.123456") → Date. */
export function slackTsToDate(ts: string | undefined) {
  return ts ? new Date(Math.round(Number(ts) * 1000)) : new Date();
}
