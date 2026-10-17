import { asc, db, eq, organizations, users } from "@drillforce/db";

/**
 * Temporary stand-in for authentication: the first seeded admin acts for the web UI.
 * Replace with real auth (Clerk) — callers only need the `{ user, org }` it returns.
 */
export async function resolveDefaultActor() {
  const [row] = await db
    .select({ user: users, org: organizations })
    .from(users)
    .innerJoin(organizations, eq(users.orgId, organizations.id))
    .where(eq(users.role, "admin"))
    .orderBy(asc(users.createdAt), asc(users.email))
    .limit(1);

  if (!row) {
    throw new Error("No admin user found. Run `npm run db:seed` to load demo data.");
  }
  return row;
}

export async function listOrganizations() {
  return db.select().from(organizations).orderBy(asc(organizations.name));
}
