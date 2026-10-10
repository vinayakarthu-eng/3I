import { ApiError, authenticateKey, type Ctx } from "@drillforce/core";
import { NextResponse, type NextRequest } from "next/server";

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status });
}

/**
 * Wraps an API route: authenticates the Bearer API key, runs the handler with a
 * security context, and maps results/errors into a consistent JSON envelope.
 */
export async function withApiKey(
  req: NextRequest,
  fn: (ctx: Ctx, req: NextRequest) => Promise<unknown>,
) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  const ctx = await authenticateKey(token);
  if (!ctx) {
    return json({ error: { code: "unauthorized", message: "Invalid or missing API key." } }, 401);
  }

  try {
    const data = await fn(ctx, req);
    return json({ data }, 200);
  } catch (err) {
    if (err instanceof ApiError) {
      return json(
        {
          error: {
            code: err.code,
            message: err.message,
            ...(err.fieldErrors ? { fieldErrors: err.fieldErrors } : {}),
          },
        },
        err.status,
      );
    }
    console.error("API v1 error:", err);
    return json({ error: { code: "internal", message: "Something went wrong." } }, 500);
  }
}
