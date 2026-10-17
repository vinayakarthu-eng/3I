import { withApiKey } from "@/app/api/v1/_lib/handler";
import { getInjectionPlan } from "@drillforce/core";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What will be injected: each stream in plain English, expected telemetry totals, run time. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return withApiKey(req, (ctx) => getInjectionPlan(ctx, params.id));
}
