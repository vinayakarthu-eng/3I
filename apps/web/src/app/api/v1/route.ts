import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Public discovery endpoint — no auth required.
export async function GET() {
  return NextResponse.json({
    data: {
      name: "DrillForce API",
      version: "v1",
      auth: "Send `Authorization: Bearer <api key>` on every request.",
      endpoints: [
        { method: "GET", path: "/api/v1/drills", description: "List drills" },
        { method: "GET", path: "/api/v1/drills/:id", description: "Get a drill" },
        { method: "GET", path: "/api/v1/drills/:id/injects", description: "List a drill's timed injects" },
        { method: "GET", path: "/api/v1/scenarios", description: "List scenario templates (?quick=true for quick drills)" },
        { method: "GET", path: "/api/v1/readiness", description: "Team readiness (?period=7d|30d|90d|all)" },
      ],
    },
  });
}
