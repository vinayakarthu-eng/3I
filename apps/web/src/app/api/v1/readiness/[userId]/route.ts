import { withApiKey } from "@/app/api/v1/_lib/handler";
import { getUserReadiness, notFound } from "@drillforce/core";
import type { NextRequest } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest, { params }: { params: { userId: string } }) {
  return withApiKey(req, async (ctx) => {
    const profile = await getUserReadiness(ctx.orgId, params.userId);
    if (!profile) throw notFound("Member");
    return profile;
  });
}
