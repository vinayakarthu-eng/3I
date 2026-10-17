"use server";

import type { ActionResult } from "@/app/drills/actions";
import { discard, runCore } from "@/lib/core-action";
import {
  createWebhook as create,
  deleteWebhook as remove,
  sendTestDelivery,
  setWebhookActive,
  updateWebhook as update,
  type WebhookInput,
} from "@drillforce/core";
import { revalidatePath } from "next/cache";

async function done<T>(result: ActionResult<T>): Promise<ActionResult> {
  if (result.ok) revalidatePath("/settings/integrations");
  return discard(result);
}

export async function createWebhook(input: WebhookInput): Promise<ActionResult> {
  return done(await runCore((ctx) => create(ctx, input)));
}

export async function updateWebhook(id: string, input: WebhookInput): Promise<ActionResult> {
  return done(await runCore((ctx) => update(ctx, id, input)));
}

export async function toggleWebhook(id: string, active: boolean): Promise<ActionResult> {
  return done(await runCore((ctx) => setWebhookActive(ctx, id, active)));
}

export async function deleteWebhook(id: string): Promise<ActionResult> {
  return done(await runCore((ctx) => remove(ctx, id)));
}

export async function testWebhook(id: string): Promise<ActionResult<{ statusCode: number | null }>> {
  const res = await runCore((ctx) => sendTestDelivery(ctx.orgId, id));
  if (!res.ok) return res;
  if (!res.data.ok) return { ok: false, error: res.data.error };
  revalidatePath("/settings/integrations");
  if (!res.data.result.success) {
    return { ok: false, error: res.data.result.error ?? "Delivery failed" };
  }
  return { ok: true, data: { statusCode: res.data.result.statusCode } };
}
