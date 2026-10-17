import { withApiKey } from "@/app/api/v1/_lib/handler";
import { getCertificationsOverview } from "@drillforce/core";
import type { NextRequest } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  return withApiKey(req, async (ctx) => ({ certifications: await getCertificationsOverview(ctx.orgId, ctx.userId) }));
}
