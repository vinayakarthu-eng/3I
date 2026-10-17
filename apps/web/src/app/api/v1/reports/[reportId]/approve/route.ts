import { withApiKey } from "@/app/api/v1/_lib/handler";
import { approveReport } from "@drillforce/core";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { reportId: string } }) {
  return withApiKey(req, (ctx) => approveReport(ctx, params.reportId));
}
