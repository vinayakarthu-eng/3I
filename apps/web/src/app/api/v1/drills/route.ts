import { withApiKey } from "@/app/api/v1/_lib/handler";
import { createDrill, listDrills } from "@drillforce/core";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withApiKey(req, async (ctx) => {
    const limitParam = Number(req.nextUrl.searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : undefined;
    return { drills: await listDrills(ctx, { limit }) };
  });
}

export async function POST(req: NextRequest) {
  return withApiKey(req, async (ctx) => {
    const body = await req.json().catch(() => ({}));
    return createDrill(ctx, body);
  });
}
