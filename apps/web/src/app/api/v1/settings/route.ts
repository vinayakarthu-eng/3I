import { withApiKey } from "@/app/api/v1/_lib/handler";
import { getOrgSettings, updateOrgSettings } from "@drillforce/core";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withApiKey(req, (ctx) => getOrgSettings(ctx));
}

export async function PUT(req: NextRequest) {
  return withApiKey(req, async (ctx) => {
    const body = await req.json().catch(() => ({}));
    return updateOrgSettings(ctx, body);
  });
}
