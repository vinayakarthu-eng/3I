import { withApiKey } from "@/app/api/v1/_lib/handler";
import { badRequest, deleteWebhook, setWebhookActive, updateWebhook, redactWebhook } from "@drillforce/core";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Full update, or `{ "active": boolean }` alone to pause/resume. */
export async function PATCH(req: NextRequest, { params }: { params: { webhookId: string } }) {
  return withApiKey(req, async (ctx) => {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const keys = Object.keys(body);
    if (keys.length === 1 && keys[0] === "active") {
      if (typeof body.active !== "boolean") throw badRequest("`active` must be a boolean.");
      return redactWebhook(await setWebhookActive(ctx, params.webhookId, body.active));
    }
    return redactWebhook(await updateWebhook(ctx, params.webhookId, body));
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { webhookId: string } }) {
  return withApiKey(req, (ctx) => deleteWebhook(ctx, params.webhookId));
}
