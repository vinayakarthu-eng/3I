import { withApiKey } from "@/app/api/v1/_lib/handler";
import { createWebhook, listWebhooks, redactWebhook } from "@drillforce/core";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withApiKey(req, async (ctx) => ({ webhooks: (await listWebhooks(ctx.orgId)).map(redactWebhook) }));
}

export async function POST(req: NextRequest) {
  return withApiKey(req, async (ctx) => {
    const body = await req.json().catch(() => ({}));
    return redactWebhook(await createWebhook(ctx, body));
  });
}
