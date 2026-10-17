import { withApiKey } from "@/app/api/v1/_lib/handler";
import { generateReport, getDrillReport } from "@drillforce/core";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return withApiKey(req, async (ctx) => ({ report: await getDrillReport(ctx, params.id) }));
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return withApiKey(req, (ctx) => generateReport(ctx, params.id));
}
