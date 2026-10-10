import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const DEFAULT_URL = "postgresql://drillforce:drillforce@localhost:5432/drillforce";

export type Database = PostgresJsDatabase<typeof schema>;

// Reuse one connection pool across Next.js hot reloads in dev.
const globalForDb = globalThis as unknown as { __drillforceSql?: postgres.Sql };

export function createClient(url = process.env.DATABASE_URL ?? DEFAULT_URL, max = 10) {
  return postgres(url, { max });
}

const sqlClient = globalForDb.__drillforceSql ?? createClient();
if (process.env.NODE_ENV !== "production") globalForDb.__drillforceSql = sqlClient;

export const db: Database = drizzle(sqlClient, { schema });
