import { withApiKey } from "@/app/api/v1/_lib/handler";
import { recordDrillEvent } from "@drillforce/core";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return withApiKey(req, async (ctx) => {
    const body = await req.json().catch(() => ({}));
    return recordDrillEvent(ctx, params.id, body);
  });
}
