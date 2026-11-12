import { object, parseApiError, requestId, type Bootstrap, type Envelope, type ErrorDetails } from "./contracts.ts";

export class ApiFailure extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly requestId: string | null;
  readonly details: ErrorDetails;
  constructor(status: number, code: string, retryable = false, id: string | null = null, details: ErrorDetails = []) {
    super(code); this.name = "ApiFailure"; this.status = status; this.code = code; this.retryable = retryable; this.requestId = id; this.details = details;
  }
}
export type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

// No request is retried automatically. Callers explicitly choose reads or
// CSRF-protected writes; response bodies and sensitive payloads are never logged.
async function jsonRequest<T>(url: string, parse: (data: unknown) => T, signal: AbortSignal, init: RequestInit, fetcher: Fetcher, expectedStatus = 200): Promise<Envelope<T>> {
  let response: Response;
  try {
    response = await fetcher(url, { ...init, credentials: "same-origin", cache: "no-store", redirect: "error", signal });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ApiFailure(0, "NETWORK_ERROR", true);
  }
  if (!/^application\/(?:[a-z0-9.+-]*\+)?json(?:;|$)/i.test(response.headers.get("content-type") || "")) throw new ApiFailure(response.status, "INVALID_RESPONSE");
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new ApiFailure(response.status, "INVALID_RESPONSE"); }
  let id: string;
  try { id = requestId(payload); } catch { throw new ApiFailure(response.status, "INVALID_RESPONSE"); }
  if (!object(payload)) throw new ApiFailure(response.status, "INVALID_RESPONSE");
  if (!response.ok) {
    try {
      const error = parseApiError(payload.error);
      throw new ApiFailure(response.status, error.code, error.retryable, id, error.details);
    } catch (error) {
      if (error instanceof ApiFailure) throw error;
      throw new ApiFailure(response.status, "INVALID_RESPONSE", false, id);
    }
  }
  if (response.status !== expectedStatus || "error" in payload || !("data" in payload)) throw new ApiFailure(response.status, "INVALID_RESPONSE", false, id);
  try { return { data: parse(payload.data), meta: { request_id: id } }; }
  catch { throw new ApiFailure(response.status, "INVALID_RESPONSE", false, id); }
}

export async function getJson<T>(url: string, parse: (data: unknown) => T, signal: AbortSignal, fetcher: Fetcher = fetch): Promise<Envelope<T>> {
  return jsonRequest(url, parse, signal, { method: "GET", headers: { Accept: "application/json" } }, fetcher);
}

export async function postJson<T>(bootstrap: Bootstrap, path: string, body: unknown, parse: (data: unknown) => T, signal: AbortSignal, fetcher: Fetcher = fetch, expectedStatus = 200): Promise<Envelope<T>> {
  if (!path.startsWith("/auth/") || /[?#\\]/.test(path) || path.includes("..")) throw new ApiFailure(0, "INVALID_AUTH_PATH");
  return jsonRequest(`${bootstrap.api_base}${path}`, parse, signal, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", [bootstrap.csrf_header]: bootstrap.csrf_token }, body: JSON.stringify(body) }, fetcher, expectedStatus);
}
