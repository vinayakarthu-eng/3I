import { integrationsUrl, slackRedirectUri } from "@/lib/slack-oauth";
import { ApiError, completeSlackInstall } from "@drillforce/core";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Slack redirects here after the admin approves (or cancels) the install.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  if (params.get("error")) {
    const cancelled = params.get("error") === "access_denied";
    return NextResponse.redirect(
      integrationsUrl(req, { slack_error: cancelled ? "Slack install was cancelled." : `Slack returned “${params.get("error")}”.` }),
    );
  }
  try {
    const { teamName } = await completeSlackInstall({
      code: params.get("code"),
      state: params.get("state"),
      redirectUri: slackRedirectUri(req),
    });
    return NextResponse.redirect(integrationsUrl(req, { slack: "connected", team: teamName }));
  } catch (err) {
    const message = err instanceof ApiError ? err.message : "Couldn't finish the Slack install.";
    if (!(err instanceof ApiError)) console.error("Slack OAuth callback failed:", err);
    return NextResponse.redirect(integrationsUrl(req, { slack_error: message }));
  }
}
