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
        { method: "POST", path: "/api/v1/drills", description: "Create a drill (templateId or name+type+objectives)" },
        { method: "GET", path: "/api/v1/drills/:id", description: "Get a drill" },
        { method: "POST", path: "/api/v1/drills/:id/status", description: "Change status { status }" },
        { method: "GET", path: "/api/v1/drills/:id/injects", description: "List a drill's timed injects" },
        { method: "POST", path: "/api/v1/drills/:id/injects/:injectId/fire", description: "Fire an inject" },
        { method: "POST", path: "/api/v1/drills/:id/scores", description: "Submit manual scores" },
        { method: "GET", path: "/api/v1/scenarios", description: "List scenario templates (?quick=true)" },
        { method: "GET", path: "/api/v1/readiness", description: "Team readiness (?period=7d|30d|90d|all)" },
        { method: "GET", path: "/api/v1/readiness/:userId", description: "A member's readiness profile" },
        { method: "GET", path: "/api/v1/analytics", description: "Org analytics + most-improved" },
        { method: "GET", path: "/api/v1/compliance", description: "Compliance status per framework" },
        { method: "GET", path: "/api/v1/certifications", description: "Certifications + holders + your progress" },
        { method: "GET", path: "/api/v1/competencies", description: "The competency catalog" },
        { method: "GET", path: "/api/v1/actions", description: "Improvement actions" },
      ],
    },
  });
}
