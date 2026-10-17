import { withApiKey } from "@/app/api/v1/_lib/handler";
import { deleteDrill, getDrill, updateDrill } from "@drillforce/core";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return withApiKey(req, (ctx) => getDrill(ctx, params.id));
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return withApiKey(req, async (ctx) => {
    const body = await req.json().catch(() => ({}));
    await updateDrill(ctx, params.id, body);
    return getDrill(ctx, params.id);
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  return withApiKey(req, (ctx) => deleteDrill(ctx, params.id));
}
