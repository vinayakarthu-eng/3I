import { withApiKey } from "@/app/api/v1/_lib/handler";
import { listDrillSignals, replaceDrillSignals } from "@drillforce/core";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return withApiKey(req, async (ctx) => ({ signals: await listDrillSignals(ctx, params.id) }));
}

/** Replace the drill's whole injection matrix (planning / preparation only). */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return withApiKey(req, async (ctx) => {
    const body = await req.json().catch(() => null);
    const signals = Array.isArray(body) ? body : (body as { signals?: unknown } | null)?.signals;
    return { signals: await replaceDrillSignals(ctx, params.id, signals) };
  });
}
