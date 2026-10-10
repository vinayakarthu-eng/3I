import { withApiKey } from "@/app/api/v1/_lib/handler";
import { badRequest, changeDrillStatus } from "@drillforce/core";
import { DRILL_STATUSES, type DrillStatus } from "@drillforce/shared";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return withApiKey(req, async (ctx) => {
    const body = await req.json().catch(() => ({}));
    const to = (body as { status?: string }).status;
    if (!to || !DRILL_STATUSES.includes(to as DrillStatus)) {
      throw badRequest("`status` must be one of: " + DRILL_STATUSES.join(", "));
    }
    return changeDrillStatus(ctx, params.id, to as DrillStatus);
  });
}
