import { ENDPOINTS } from "@drillforce/core";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Public discovery endpoint — no auth required. Generated from the same table as the OpenAPI spec.
export async function GET() {
  return NextResponse.json({
    data: {
      name: "DrillForce API",
      version: "v1",
      auth: "Send `Authorization: Bearer <api key>` on every request.",
      openapi: "/api/v1/openapi.json",
      endpoints: ENDPOINTS.map((e) => ({
        method: e.method,
        path: `/api/v1${e.path === "/" ? "" : e.path.replace(/\{(\w+)\}/g, ":$1")}`,
        description: e.summary,
      })),
    },
  });
}
