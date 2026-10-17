import { withApiKey } from "@/app/api/v1/_lib/handler";
import { badRequest, createActionFromReport } from "@drillforce/core";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { reportId: string } }) {
  return withApiKey(req, async (ctx) => {
    const body = await req.json().catch(() => ({}));
    const index = (body as { index?: unknown }).index;
    if (typeof index !== "number") throw badRequest("`index` (the corrective action's position) is required.");
    return createActionFromReport(ctx, params.reportId, index);
  });
}
