import { withApiKey } from "@/app/api/v1/_lib/handler";
import { updateImprovementAction } from "@drillforce/core";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: { actionId: string } }) {
  return withApiKey(req, async (ctx) => {
    const body = await req.json().catch(() => ({}));
    return updateImprovementAction(ctx, params.actionId, body);
  });
}
