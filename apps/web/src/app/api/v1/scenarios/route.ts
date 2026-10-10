import { withApiKey } from "@/app/api/v1/_lib/handler";
import { listScenarios } from "@drillforce/core";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withApiKey(req, async () => {
    const quick = req.nextUrl.searchParams.get("quick") === "true";
    return { scenarios: await listScenarios({ quickDrillsOnly: quick }) };
  });
}
