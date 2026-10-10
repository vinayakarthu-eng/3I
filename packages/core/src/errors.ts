/** A domain error carrying an HTTP status + stable code, mapped by the API layer. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const notFound = (what = "Resource") => new ApiError(404, "not_found", `${what} not found.`);
export const badRequest = (message: string, fieldErrors?: Record<string, string>) =>
  new ApiError(400, "bad_request", message, fieldErrors);
export const unauthorized = (message = "Invalid or missing API key.") =>
  new ApiError(401, "unauthorized", message);
