import { withApiKey } from "@/app/api/v1/_lib/handler";
import { getDrillAnalytics, getMostImproved } from "@drillforce/core";
import type { NextRequest } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  return withApiKey(req, async (ctx) => {
    const [drills, mostImproved] = await Promise.all([getDrillAnalytics(ctx.orgId), getMostImproved(ctx.orgId)]);
    return { drills, mostImproved };
  });
}
