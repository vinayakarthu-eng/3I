import { and, asc, db, desc, eq, webhookDeliveries, webhooks } from "@drillforce/db";
import { WEBHOOK_EVENTS, type WebhookEvent } from "@drillforce/shared";
import crypto from "node:crypto";
import { z } from "zod";
import type { Ctx } from "./context";
import { badRequest, notFound } from "./errors";
import { flatten } from "./validation";

export async function listWebhooks(orgId: string) {
  return db.select().from(webhooks).where(eq(webhooks.orgId, orgId)).orderBy(asc(webhooks.createdAt));
}

export interface DeliveryRow {
  id: string;
  webhookId: string;
  webhookName: string;
  event: string;
  success: boolean;
  statusCode: number | null;
  error: string | null;
  createdAt: Date;
}

export async function listRecentDeliveries(orgId: string, limit = 20): Promise<DeliveryRow[]> {
  return db
    .select({
      id: webhookDeliveries.id,
      webhookId: webhookDeliveries.webhookId,
      webhookName: webhooks.name,
      event: webhookDeliveries.event,
      success: webhookDeliveries.success,
      statusCode: webhookDeliveries.statusCode,
      error: webhookDeliveries.error,
      createdAt: webhookDeliveries.createdAt,
    })
    .from(webhookDeliveries)
    .innerJoin(webhooks, eq(webhooks.id, webhookDeliveries.webhookId))
    .where(eq(webhooks.orgId, orgId))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit) as Promise<DeliveryRow[]>;
}

async function deliver(
  webhook: { id: string; url: string; secret: string | null },
  event: string,
  payload: Record<string, unknown>,
) {
  const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
  const headers: Record<string, string> = { "content-type": "application/json", "x-drillforce-event": event };
  if (webhook.secret) {
    headers["x-drillforce-signature"] = crypto.createHmac("sha256", webhook.secret).update(body).digest("hex");
  }

  let success = false;
  let statusCode: number | null = null;
  let error: string | null = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(webhook.url, { method: "POST", headers, body, signal: controller.signal });
    clearTimeout(timeout);
    statusCode = res.status;
    success = res.ok;
    if (!res.ok) error = `HTTP ${res.status}`;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  await db.insert(webhookDeliveries).values({ webhookId: webhook.id, event, success, statusCode, error });
  return { success, statusCode, error };
}

/** POST an event to every active webhook in the org subscribed to it. Fire-and-forget safe. */
export async function dispatchWebhookEvent(
  orgId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>,
) {
  try {
    const active = await db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.orgId, orgId), eq(webhooks.active, true)));
    const subscribed = active.filter((w) => (w.events ?? []).includes(event));
    await Promise.all(subscribed.map((w) => deliver(w, event, payload)));
  } catch (err) {
    console.error("dispatchWebhookEvent failed", err);
  }
}

/** Send a sample payload to a single webhook (the "Test" button). */
export async function sendTestDelivery(orgId: string, webhookId: string) {
  const [w] = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.id, webhookId), eq(webhooks.orgId, orgId)));
  if (!w) return { ok: false as const, error: "Webhook not found." };
  const result = await deliver(w, "test.ping", { message: "DrillForce test delivery", webhookId });
  return { ok: true as const, result };
}

// ─── management ───────────────────────────────────────────────────────────────
const UUID = /^[0-9a-f-]{36}$/i;

export const webhookInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  url: z.string().trim().url("Enter a valid URL"),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, "Select at least one event"),
  secret: z.string().trim().max(200).optional().default(""),
  active: z.boolean().optional().default(true),
});
export type WebhookInput = z.input<typeof webhookInput>;

function parseWebhook(raw: unknown) {
  const parsed = webhookInput.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message, flatten(parsed.error));
  const { secret, ...rest } = parsed.data;
  return { ...rest, secret: secret || null };
}

/** API-safe view: never echo the signing secret back. */
export function redactWebhook(w: typeof webhooks.$inferSelect) {
  const { secret, ...rest } = w;
  return { ...rest, hasSecret: !!secret };
}

export async function createWebhook(ctx: Ctx, raw: unknown) {
  const [row] = await db
    .insert(webhooks)
    .values({ orgId: ctx.orgId, ...parseWebhook(raw) })
    .returning();
  return row;
}

export async function updateWebhook(ctx: Ctx, id: string, raw: unknown) {
  if (!UUID.test(id)) throw notFound("Webhook");
  const [row] = await db
    .update(webhooks)
    .set(parseWebhook(raw))
    .where(and(eq(webhooks.id, id), eq(webhooks.orgId, ctx.orgId)))
    .returning();
  if (!row) throw notFound("Webhook");
  return row;
}

export async function setWebhookActive(ctx: Ctx, id: string, active: boolean) {
  if (!UUID.test(id)) throw notFound("Webhook");
  const [row] = await db
    .update(webhooks)
    .set({ active })
    .where(and(eq(webhooks.id, id), eq(webhooks.orgId, ctx.orgId)))
    .returning();
  if (!row) throw notFound("Webhook");
  return row;
}

export async function deleteWebhook(ctx: Ctx, id: string) {
  if (!UUID.test(id)) throw notFound("Webhook");
  const [row] = await db
    .delete(webhooks)
    .where(and(eq(webhooks.id, id), eq(webhooks.orgId, ctx.orgId)))
    .returning({ id: webhooks.id });
  if (!row) throw notFound("Webhook");
  return { id, deleted: true };
}
