import { withApiKey } from "@/app/api/v1/_lib/handler";
import { submitScores } from "@drillforce/core";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return withApiKey(req, async (ctx) => {
    const body = await req.json().catch(() => ({}));
    const scores = Array.isArray(body) ? body : (body as { scores?: unknown }).scores;
    return submitScores(ctx, params.id, scores);
  });
}
