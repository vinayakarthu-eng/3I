import "server-only";
import { listOrganizations, resolveDefaultActor } from "@drillforce/core";
import { cache } from "react";

/**
 * Temporary stand-in for authentication: the first seeded admin is the
 * "current user". Replace with Clerk once auth is added.
 */
export const getCurrentUser = cache(resolveDefaultActor);

export const getUserOrganizations = cache(listOrganizations);
