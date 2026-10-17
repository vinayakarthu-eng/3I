import { withApiKey } from "@/app/api/v1/_lib/handler";
import { listCompetencyAreas } from "@drillforce/core";
import type { NextRequest } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  return withApiKey(req, async () => ({ competencies: await listCompetencyAreas() }));
}
