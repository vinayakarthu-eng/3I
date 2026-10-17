import { openApiDocument } from "@drillforce/core";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

// Public — the OpenAPI document for /api/v1.
export async function GET(req: NextRequest) {
  return NextResponse.json(openApiDocument(`${req.nextUrl.origin}/api/v1`));
}
