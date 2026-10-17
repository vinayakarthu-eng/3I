import type { WebClient } from "@slack/web-api";
import { system } from "@drillforce/core";

interface ResolvedUser {
  /** DrillForce user id when the Slack email matches an org member; else "slack:<id>". */
  actor: string;
  name: string;
  email?: string;
}

const cache = new Map<string, ResolvedUser>();

/** Maps a Slack user to a DrillForce user via their email address. */
export async function resolveSlackUser(client: WebClient, slackUserId: string): Promise<ResolvedUser> {
  const hit = cache.get(slackUserId);
  if (hit) return hit;

  let resolved: ResolvedUser = { actor: `slack:${slackUserId}`, name: slackUserId };
  try {
    const info = await client.users.info({ user: slackUserId });
    const profile = info.user?.profile;
    const email = profile?.email?.toLowerCase();
    const name = profile?.real_name || profile?.display_name || info.user?.name || slackUserId;
    resolved = { actor: `slack:${slackUserId}`, name, email };
    if (email) {
      const match = await system.findUserByEmail(email);
      if (match) resolved = { actor: match.id, name: match.name, email };
    }
  } catch (err) {
    console.warn(`Could not resolve Slack user ${slackUserId}:`, (err as Error).message);
  }
  cache.set(slackUserId, resolved);
  return resolved;
}

/** Finds the Slack user id for a DrillForce participant's email (needs users:read.email). */
export async function slackIdForEmail(client: WebClient, email: string) {
  try {
    const res = await client.users.lookupByEmail({ email });
    return res.user?.id ?? null;
  } catch {
    return null;
  }
}
