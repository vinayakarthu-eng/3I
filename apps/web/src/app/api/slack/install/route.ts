import { currentCtx } from "@/lib/core-action";
import { integrationsUrl, slackRedirectUri } from "@/lib/slack-oauth";
import { ApiError, slackInstallUrl } from "@drillforce/core";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Add to Slack": send the signed-in admin to Slack to approve the install for their org.
export async function GET(req: NextRequest) {
  try {
    return NextResponse.redirect(slackInstallUrl(await currentCtx(), slackRedirectUri(req)));
  } catch (err) {
    const message = err instanceof ApiError ? err.message : "Couldn't start the Slack install.";
    if (!(err instanceof ApiError)) console.error("Slack install start failed:", err);
    return NextResponse.redirect(integrationsUrl(req, { slack_error: message }));
  }
}
