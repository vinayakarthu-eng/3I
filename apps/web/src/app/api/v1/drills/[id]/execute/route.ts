import { withApiKey } from "@/app/api/v1/_lib/handler";
import { executeDrill } from "@drillforce/core";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return withApiKey(req, (ctx) => executeDrill(ctx, params.id));
}
