import "server-only";
import type { ActionResult } from "@/app/drills/actions";
import { getCurrentUser } from "@/lib/current-user";
import { ApiError, type Ctx } from "@drillforce/core";

/** The signed-in user's security context for core operations. */
export async function currentCtx(): Promise<Ctx> {
  const { user, org } = await getCurrentUser();
  return { orgId: org.id, userId: user.id };
}

/**
 * Runs a core operation for a server action: core's typed errors become the action's
 * `{ ok: false, error, fieldErrors }`; anything unexpected is logged and reported as `fallback`.
 */
export async function runCore<T>(
  fn: (ctx: Ctx) => Promise<T>,
  fallback = "Something went wrong. Check the server logs.",
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn(await currentCtx()) };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, error: err.message, ...(err.fieldErrors ? { fieldErrors: err.fieldErrors } : {}) };
    }
    console.error(err);
    return { ok: false, error: fallback };
  }
}

/** For actions whose result the UI doesn't use. */
export function discard<T>(result: ActionResult<T>): ActionResult {
  return result.ok ? { ok: true, data: null } : result;
}
