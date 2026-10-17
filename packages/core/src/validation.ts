import type { z } from "zod";

/** Zod issues → `{ "path.to.field": message }` for ApiError field errors. */
export function flatten(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[issue.path.join(".") || "_"] = issue.message;
  return out;
}
