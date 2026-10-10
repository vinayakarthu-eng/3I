import { and, apiKeys, db, desc, eq, isNull } from "@drillforce/db";
import type { Ctx } from "./context";
import { generateApiKey } from "./auth";
import { badRequest, notFound } from "./errors";

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export async function listApiKeys(ctx: Ctx): Promise<ApiKeyRow[]> {
  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.orgId, ctx.orgId), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt));
}

/** Mint a key for the org. The raw key is returned exactly once. */
export async function createApiKey(ctx: Ctx, name: string): Promise<{ raw: string; key: ApiKeyRow }> {
  const trimmed = name?.trim();
  if (!trimmed) throw badRequest("A key name is required.");
  const { raw, hashedKey, prefix } = generateApiKey();
  const [row] = await db
    .insert(apiKeys)
    .values({ orgId: ctx.orgId, name: trimmed.slice(0, 120), prefix, hashedKey, createdBy: ctx.userId })
    .returning({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    });
  return { raw, key: row };
}

export async function revokeApiKey(ctx: Ctx, id: string): Promise<void> {
  const result = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.orgId, ctx.orgId), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id });
  if (!result.length) throw notFound("API key");
}
