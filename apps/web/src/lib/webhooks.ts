import "server-only";
import { and, asc, db, desc, eq, webhookDeliveries, webhooks } from "@drillforce/db";
import crypto from "node:crypto";

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
  event: string,
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
