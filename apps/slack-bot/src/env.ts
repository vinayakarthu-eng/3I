import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Load the monorepo root .env (shared with the web app and packages/db).
const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../../.env") });

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.endsWith("...")) {
    // Exit cleanly so `turbo dev` keeps running the web app when Slack isn't configured yet.
    console.warn(
      `\n⚠️  Slack bot not started: ${name} is missing. Add it to the root .env file (see apps/slack-bot/README.md).\n`,
    );
    process.exit(0);
  }
  return value;
}

export const env = {
  /** App-level token (xapp-, connections:write): one Socket Mode connection for every workspace. */
  slackAppToken: required("SLACK_APP_TOKEN"),
  /** Legacy single-workspace bot token. Optional — orgs normally connect via Add to Slack. */
  slackBotToken: process.env.SLACK_BOT_TOKEN && !process.env.SLACK_BOT_TOKEN.endsWith("...") ? process.env.SLACK_BOT_TOKEN : undefined,
  /** Org the legacy token's workspace belongs to (default: the demo org). */
  legacyOrgId: process.env.SLACK_LEGACY_ORG_ID || undefined,
  slackSigningSecret: process.env.SLACK_SIGNING_SECRET ?? "",
  /** Optional: without it the IC bot falls back to scripted challenges. */
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || undefined,
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
  /** How long the channel must be quiet before the IC bot speaks up (ms). */
  quietMinMs: Number(process.env.IC_QUIET_MIN_SECONDS ?? 180) * 1000,
  quietMaxMs: Number(process.env.IC_QUIET_MAX_SECONDS ?? 300) * 1000,
  webAppUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
};
