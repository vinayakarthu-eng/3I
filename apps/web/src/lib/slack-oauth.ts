import "server-only";
import type { NextRequest } from "next/server";

/** The OAuth redirect URI — must be identical in the authorize and token-exchange steps,
 * and listed under the Slack app's "OAuth & Permissions → Redirect URLs". */
export function slackRedirectUri(req: NextRequest) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/+$/, "");
  return `${base}/api/slack/oauth/callback`;
}

export function integrationsUrl(req: NextRequest, params: Record<string, string>) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/+$/, "");
  return `${base}/settings/integrations?${new URLSearchParams(params)}`;
}
