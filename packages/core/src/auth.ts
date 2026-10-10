import { and, apiKeys, db, eq, isNull, users } from "@drillforce/db";
import crypto from "node:crypto";
import type { Ctx } from "./context";

const KEY_PREFIX = "df_live_";

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export interface GeneratedKey {
  /** The full key — shown to the caller exactly once, never stored. */
  raw: string;
  /** SHA-256 of the raw key; what we persist. */
  hashedKey: string;
  /** Display prefix, safe to store and show in the UI. */
  prefix: string;
}

/** Mint a new API key. The caller must persist `hashedKey` + `prefix`, show `raw` once. */
export function generateApiKey(): GeneratedKey {
  const secret = crypto.randomBytes(24).toString("hex");
  const raw = KEY_PREFIX + secret;
  return { raw, hashedKey: sha256(raw), prefix: KEY_PREFIX + secret.slice(0, 6) };
}

/**
 * Resolve an API key to a security context, or null if invalid/revoked.
 * The acting user is the key's creator, falling back to the org's first admin.
 */
export async function authenticateKey(raw: string | null | undefined): Promise<Ctx | null> {
  const key = raw?.trim();
  if (!key || !key.startsWith(KEY_PREFIX)) return null;

  const [row] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.hashedKey, sha256(key)), isNull(apiKeys.revokedAt)));
  if (!row) return null;

  let userId = row.createdBy;
  if (!userId) {
    const [admin] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.orgId, row.orgId), eq(users.role, "admin")))
      .limit(1);
    userId = admin?.id ?? null;
  }
  if (!userId) return null;

  void db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id));
  return { orgId: row.orgId, userId };
}
