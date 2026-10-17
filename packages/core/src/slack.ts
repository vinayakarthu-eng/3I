import { db, eq, slackInstallations, users } from "@drillforce/db";
import type { Ctx } from "./context";
import { ApiError, badRequest } from "./errors";
import { decryptSecret, encryptSecret, hasEncryptionKey, signState, verifyState } from "./secrets";

/**
 * Per-org Slack workspaces. Each org installs the DrillForce Slack app once ("Add to Slack");
 * the OAuth callback stores that workspace's bot token (encrypted). The Slack bot then serves
 * every installed workspace from one Socket Mode connection and routes each event to the org
 * that owns the workspace.
 */

/** Bot scopes requested at install — keep in sync with apps/slack-bot/slack-app-manifest.yaml. */
export const SLACK_BOT_SCOPES = [
  "commands",
  "chat:write",
  "channels:manage",
  "channels:read",
  "channels:history",
  "channels:join",
  "reactions:read",
  "users:read",
  "users:read.email",
];

const slackApi = () => (process.env.SLACK_API_URL ?? "https://slack.com/api").replace(/\/+$/, "");

/** What's missing for "Add to Slack" to work (empty when it's ready). */
export function slackInstallMissingConfig(): string[] {
  const missing: string[] = [];
  if (!process.env.SLACK_CLIENT_ID) missing.push("SLACK_CLIENT_ID");
  if (!process.env.SLACK_CLIENT_SECRET) missing.push("SLACK_CLIENT_SECRET");
  if (!hasEncryptionKey()) missing.push("SLACK_ENCRYPTION_KEY");
  return missing;
}

function requireInstallConfig() {
  const missing = slackInstallMissingConfig();
  if (missing.length) {
    throw new ApiError(503, "not_configured", `Slack install isn't configured: set ${missing.join(", ")}.`);
  }
}

interface InstallState extends Record<string, unknown> {
  orgId: string;
  userId: string;
}

/** The slack.com authorize URL for this org's admin to approve the install. */
export function slackInstallUrl(ctx: Ctx, redirectUri: string) {
  requireInstallConfig();
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", process.env.SLACK_CLIENT_ID!);
  url.searchParams.set("scope", SLACK_BOT_SCOPES.join(","));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", signState({ orgId: ctx.orgId, userId: ctx.userId } satisfies InstallState));
  return url.toString();
}

interface OAuthAccess {
  ok: boolean;
  error?: string;
  access_token?: string;
  scope?: string;
  bot_user_id?: string;
  team?: { id: string; name: string };
  enterprise?: { id: string } | null;
}

/**
 * The OAuth callback: verify `state`, exchange `code` for the bot token, and store it for the
 * org that started the install. Re-installing replaces the org's previous workspace.
 */
export async function completeSlackInstall(params: { code: string | null; state: string | null; redirectUri: string }) {
  requireInstallConfig();
  const state = verifyState<InstallState>(params.state);
  if (!state) throw badRequest("This Slack install link has expired or was tampered with. Start again from Settings.");
  if (!params.code) throw badRequest("Slack didn't return an authorization code.");

  const res = await fetch(`${slackApi()}/oauth.v2.access`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.SLACK_CLIENT_ID!,
      client_secret: process.env.SLACK_CLIENT_SECRET!,
      code: params.code,
      redirect_uri: params.redirectUri,
    }),
  });
  const access = (await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }))) as OAuthAccess;
  if (!access.ok || !access.access_token || !access.team?.id || !access.bot_user_id) {
    throw badRequest(`Slack rejected the install (${access.error ?? "missing bot token"}).`);
  }

  const [owner] = await db
    .select({ orgId: slackInstallations.orgId })
    .from(slackInstallations)
    .where(eq(slackInstallations.teamId, access.team.id));
  if (owner && owner.orgId !== state.orgId) {
    throw badRequest(`The Slack workspace “${access.team.name}” is already connected to another DrillForce organization.`);
  }

  const values = {
    teamId: access.team.id,
    teamName: access.team.name,
    enterpriseId: access.enterprise?.id ?? null,
    botUserId: access.bot_user_id,
    botTokenEncrypted: encryptSecret(access.access_token),
    scopes: access.scope ?? "",
    installedBy: state.userId,
    installedAt: new Date(),
  };
  await db
    .insert(slackInstallations)
    .values({ orgId: state.orgId, ...values })
    .onConflictDoUpdate({ target: slackInstallations.orgId, set: values });
  return { orgId: state.orgId, teamId: access.team.id, teamName: access.team.name };
}

/** The org's Slack connection, for Settings (never includes the token). */
export async function getSlackConnection(ctx: Ctx) {
  const [row] = await db
    .select({
      teamId: slackInstallations.teamId,
      teamName: slackInstallations.teamName,
      botUserId: slackInstallations.botUserId,
      scopes: slackInstallations.scopes,
      installedAt: slackInstallations.installedAt,
      installedBy: users.name,
    })
    .from(slackInstallations)
    .leftJoin(users, eq(users.id, slackInstallations.installedBy))
    .where(eq(slackInstallations.orgId, ctx.orgId));
  if (!row) return { connected: false as const, installReady: slackInstallMissingConfig().length === 0 };
  const granted = new Set(row.scopes.split(",").filter(Boolean));
  return {
    connected: true as const,
    ...row,
    scopes: [...granted],
    missingScopes: SLACK_BOT_SCOPES.filter((s) => !granted.has(s)),
  };
}

/** Disconnect the org's workspace: revoke the token at Slack (best effort) and forget it. */
export async function disconnectSlack(ctx: Ctx) {
  const [row] = await db
    .delete(slackInstallations)
    .where(eq(slackInstallations.orgId, ctx.orgId))
    .returning();
  if (!row) return { disconnected: false };
  try {
    await fetch(`${slackApi()}/auth.revoke`, {
      method: "POST",
      headers: { authorization: `Bearer ${decryptSecret(row.botTokenEncrypted)}` },
    });
  } catch (err) {
    console.warn("Slack token revoke failed (already disconnected locally):", (err as Error).message);
  }
  return { disconnected: true, teamName: row.teamName };
}

// ─── system (the bot) ─────────────────────────────────────────────────────────
export interface ResolvedInstallation {
  orgId: string;
  teamId: string;
  teamName: string;
  botUserId: string;
  botToken: string;
}

function resolve(row: typeof slackInstallations.$inferSelect): ResolvedInstallation {
  return {
    orgId: row.orgId,
    teamId: row.teamId,
    teamName: row.teamName,
    botUserId: row.botUserId,
    botToken: decryptSecret(row.botTokenEncrypted),
  };
}

export async function findSlackInstallationByTeam(teamId: string): Promise<ResolvedInstallation | null> {
  const [row] = await db.select().from(slackInstallations).where(eq(slackInstallations.teamId, teamId));
  return row ? resolve(row) : null;
}

export async function findSlackInstallationByOrg(orgId: string): Promise<ResolvedInstallation | null> {
  const [row] = await db.select().from(slackInstallations).where(eq(slackInstallations.orgId, orgId));
  return row ? resolve(row) : null;
}

export async function listSlackInstallations() {
  return (await db.select().from(slackInstallations)).map(resolve);
}
