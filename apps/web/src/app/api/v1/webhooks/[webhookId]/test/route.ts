import { withApiKey } from "@/app/api/v1/_lib/handler";
import { notFound, sendTestDelivery } from "@drillforce/core";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { webhookId: string } }) {
  return withApiKey(req, async (ctx) => {
    const res = await sendTestDelivery(ctx.orgId, params.webhookId);
    if (!res.ok) throw notFound("Webhook");
    return res.result;
  });
}
