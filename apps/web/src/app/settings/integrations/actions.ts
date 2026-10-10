"use server";

import type { ActionResult } from "@/app/drills/actions";
import { getCurrentUser } from "@/lib/current-user";
import { sendTestDelivery } from "@/lib/webhooks";
import { and, db, eq, webhooks } from "@drillforce/db";
import { WEBHOOK_EVENTS } from "@drillforce/shared";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const webhookSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  url: z.string().trim().url("Enter a valid URL"),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, "Select at least one event"),
  secret: z.string().trim().max(200).optional().default(""),
  active: z.boolean().optional().default(true),
});

function refresh() {
  revalidatePath("/settings/integrations");
}

export async function createWebhook(input: z.input<typeof webhookSchema>): Promise<ActionResult> {
  const parsed = webhookSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { org } = await getCurrentUser();
  await db.insert(webhooks).values({
    orgId: org.id,
    name: parsed.data.name,
    url: parsed.data.url,
    events: parsed.data.events,
    secret: parsed.data.secret || null,
    active: parsed.data.active,
  });
  refresh();
  return { ok: true, data: null };
}

export async function updateWebhook(
  id: string,
  input: z.input<typeof webhookSchema>,
): Promise<ActionResult> {
  const parsed = webhookSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { org } = await getCurrentUser();
  const res = await db
    .update(webhooks)
    .set({
      name: parsed.data.name,
      url: parsed.data.url,
      events: parsed.data.events,
      secret: parsed.data.secret || null,
      active: parsed.data.active,
    })
    .where(and(eq(webhooks.id, id), eq(webhooks.orgId, org.id)))
    .returning({ id: webhooks.id });
  if (!res.length) return { ok: false, error: "Webhook not found." };
  refresh();
  return { ok: true, data: null };
}

export async function toggleWebhook(id: string, active: boolean): Promise<ActionResult> {
  const { org } = await getCurrentUser();
  await db
    .update(webhooks)
    .set({ active })
    .where(and(eq(webhooks.id, id), eq(webhooks.orgId, org.id)));
  refresh();
  return { ok: true, data: null };
}

export async function deleteWebhook(id: string): Promise<ActionResult> {
  const { org } = await getCurrentUser();
  await db.delete(webhooks).where(and(eq(webhooks.id, id), eq(webhooks.orgId, org.id)));
  refresh();
  return { ok: true, data: null };
}

export async function testWebhook(id: string): Promise<ActionResult<{ statusCode: number | null }>> {
  const { org } = await getCurrentUser();
  const res = await sendTestDelivery(org.id, id);
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  if (!res.result.success) {
    return { ok: false, error: res.result.error ?? "Delivery failed" };
  }
  return { ok: true, data: { statusCode: res.result.statusCode } };
}
