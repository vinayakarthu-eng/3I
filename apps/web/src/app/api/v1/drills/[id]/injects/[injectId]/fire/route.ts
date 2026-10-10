import { withApiKey } from "@/app/api/v1/_lib/handler";
import { fireInject } from "@drillforce/core";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; injectId: string } },
) {
  return withApiKey(req, (ctx) => fireInject(ctx, params.id, params.injectId));
}
