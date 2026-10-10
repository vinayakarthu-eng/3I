import { withApiKey } from "@/app/api/v1/_lib/handler";
import { getDrill } from "@drillforce/core";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return withApiKey(req, (ctx) => getDrill(ctx, params.id));
}
