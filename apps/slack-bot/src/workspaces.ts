import { resolveDefaultActor, system } from "@drillforce/core";
import { WebClient } from "@slack/web-api";
import { env } from "./env";

/**
 * Which Slack workspace belongs to which DrillForce org, and a WebClient per workspace.
 *
 * Workspaces come from `slack_installations` (orgs connect via Settings → Integrations →
 * Add to Slack). A legacy SLACK_BOT_TOKEN still works: its workspace is mapped to
 * SLACK_LEGACY_ORG_ID (or the demo org) unless that workspace has a real installation.
 */
export interface Workspace {
  orgId: string;
  teamId: string;
  teamName: string;
  botUserId: string;
  botToken: string;
}

const TTL_MS = 60_000;

/** SLACK_API_URL points every client at a different Slack API (tests). */
const newClient = (token: string) =>
  new WebClient(token, process.env.SLACK_API_URL ? { slackApiUrl: process.env.SLACK_API_URL.replace(/\/?$/, "/") } : {});
const byTeam = new Map<string, { at: number; value: Workspace | null }>();
const clients = new Map<string, WebClient>();
let legacy: Workspace | null = null;

/** Resolve the legacy single-workspace token (if configured) once at startup. */
export async function initLegacyWorkspace() {
  if (!env.slackBotToken) return null;
  const auth = await newClient(env.slackBotToken).auth.test();
  if (!auth.team_id || !auth.user_id) throw new Error("SLACK_BOT_TOKEN auth.test returned no team.");
  if (await system.findSlackInstallationByTeam(auth.team_id)) {
    console.log(`ℹ️  ${auth.team} is installed via Add to Slack; ignoring SLACK_BOT_TOKEN.`);
    return null;
  }
  const orgId = env.legacyOrgId ?? (await resolveDefaultActor()).org.id;
  legacy = { orgId, teamId: auth.team_id, teamName: auth.team ?? auth.team_id, botUserId: auth.user_id, botToken: env.slackBotToken };
  console.log(`ℹ️  Legacy SLACK_BOT_TOKEN: ${legacy.teamName} → org ${orgId}. Prefer Add to Slack (Settings → Integrations).`);
  return legacy;
}

export async function workspaceForTeam(teamId: string | undefined): Promise<Workspace | null> {
  if (!teamId) return null;
  const hit = byTeam.get(teamId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = (await system.findSlackInstallationByTeam(teamId)) ?? (legacy?.teamId === teamId ? legacy : null);
  byTeam.set(teamId, { at: Date.now(), value });
  return value;
}

export async function workspaceForOrg(orgId: string): Promise<Workspace | null> {
  const installed = await system.findSlackInstallationByOrg(orgId);
  if (installed) return installed;
  return legacy?.orgId === orgId ? legacy : null;
}

/** Forget a workspace (e.g. after its token was revoked) so the next lookup re-reads the DB. */
export function forgetWorkspace(teamId: string) {
  byTeam.delete(teamId);
  clients.delete(teamId);
}

export function clientFor(workspace: Workspace) {
  let client = clients.get(workspace.teamId);
  if (!client || client.token !== workspace.botToken) {
    client = newClient(workspace.botToken);
    clients.set(workspace.teamId, client);
  }
  return client;
}

export async function countWorkspaces() {
  const installed = await system.listSlackInstallations();
  return installed.length + (legacy ? 1 : 0);
}

/** Session key: channel ids are only guaranteed unique within a workspace. */
export const channelKey = (teamId: string, channelId: string) => `${teamId}:${channelId}`;

/** Slack errors that mean this workspace's token no longer works. */
export function isAuthRevoked(err: unknown) {
  const code = (err as { data?: { error?: string } })?.data?.error;
  return ["token_revoked", "invalid_auth", "account_inactive", "not_authed", "team_not_found"].includes(code ?? "");
}
