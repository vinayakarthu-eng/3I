import "server-only";
import { asc, db, eq, organizations, users } from "@drillforce/db";
import { cache } from "react";

/**
 * Temporary stand-in for authentication: the first seeded admin is the
 * "current user". Replace with Clerk once auth is added.
 */
export const getCurrentUser = cache(async () => {
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
});

export const getUserOrganizations = cache(async () => {
  return db.select().from(organizations).orderBy(asc(organizations.name));
});
