import { object, parseApiError, requestId, type Envelope } from "./contracts.ts";

export class ApiFailure extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly requestId: string | null;
  constructor(status: number, code: string, retryable = false, id: string | null = null) {
    super(code); this.name = "ApiFailure"; this.status = status; this.code = code; this.retryable = retryable; this.requestId = id;
  }
}
export type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

// This N03 client is deliberately read-only. It does not replay writes or put
// CSRF values, identity, or current-event data in browser persistence.
export async function getJson<T>(url: string, parse: (data: unknown) => T, signal: AbortSignal, fetcher: Fetcher = fetch): Promise<Envelope<T>> {
  let response: Response;
  try {
    response = await fetcher(url, { method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error", headers: { Accept: "application/json" }, signal });
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
      throw new ApiFailure(response.status, error.code, error.retryable, id);
    } catch (error) {
      if (error instanceof ApiFailure) throw error;
      throw new ApiFailure(response.status, "INVALID_RESPONSE", false, id);
    }
  }
  if ("error" in payload || !("data" in payload)) throw new ApiFailure(response.status, "INVALID_RESPONSE", false, id);
  try { return { data: parse(payload.data), meta: { request_id: id } }; }
  catch { throw new ApiFailure(response.status, "INVALID_RESPONSE", false, id); }
}
