import { withApiKey } from "@/app/api/v1/_lib/handler";
import { getReport } from "@drillforce/core";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { reportId: string } }) {
  return withApiKey(req, (ctx) => getReport(ctx, params.reportId));
}
