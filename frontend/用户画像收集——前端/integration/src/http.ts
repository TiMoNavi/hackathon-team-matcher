import { object } from "./contracts.ts";

export type ProfileFetcher = (input: string, init: RequestInit) => Promise<Response>;
export class ProfileReadFailure extends Error {
  readonly status: number; readonly code: string; readonly retryable: boolean; readonly requestId: string | null;
  constructor(status: number, code: string, retryable = false, requestId: string | null = null) { super(code); this.name = "ProfileReadFailure"; this.status = status; this.code = code; this.retryable = retryable; this.requestId = requestId; }
}
export function apiBase(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\s?#]/.test(value) || value.includes("..") || !value.endsWith("/api/v1")) throw new ProfileReadFailure(0, "INVALID_API_BASE");
  return value;
}
/** Read-only transport: no CSRF, body, mutation, retry, cache or storage interface. */
export async function readProfileJson<T>(url: string, parse: (value: unknown) => T, signal: AbortSignal, fetcher: ProfileFetcher = fetch): Promise<T> {
  if (!url.startsWith("/") || url.startsWith("//") || /[\\\s#]/.test(url)) throw new ProfileReadFailure(0, "INVALID_READ_PATH");
  const parsed = new URL(url, "https://profile.invalid");
  if (parsed.origin !== "https://profile.invalid" || parsed.pathname !== url.split("?")[0] || !parsed.pathname.includes("/api/v1/")) throw new ProfileReadFailure(0, "INVALID_READ_PATH");
  if (signal.aborted) throw new ProfileReadFailure(0, "READ_CANCELLED");
  let response: Response;
  try { response = await fetcher(url, { method: "GET", headers: { Accept: "application/json" }, credentials: "same-origin", cache: "no-store", redirect: "error", signal }); }
  catch { throw new ProfileReadFailure(0, signal.aborted ? "READ_CANCELLED" : "NETWORK_ERROR", !signal.aborted); }
  if (!/^application\/(?:[a-z0-9.+-]*\+)?json(?:;|$)/i.test(response.headers.get("content-type") || "")) throw new ProfileReadFailure(response.status, "INVALID_RESPONSE");
  let value: unknown; try { value = await response.json(); } catch { throw new ProfileReadFailure(response.status, "INVALID_RESPONSE"); }
  if (!object(value) || !object(value.meta) || typeof value.meta.request_id !== "string" || !/^[a-f0-9]{24}$/.test(value.meta.request_id)) throw new ProfileReadFailure(response.status, "INVALID_RESPONSE");
  const requestId = value.meta.request_id;
  if (!response.ok) {
    const error = value.error;
    if (!object(error) || typeof error.code !== "string" || !/^[A-Z][A-Z0-9_]{0,95}$/.test(error.code) || typeof error.message !== "string" || typeof error.retryable !== "boolean" || !(object(error.details) || Array.isArray(error.details) && error.details.length === 0)) throw new ProfileReadFailure(response.status, "INVALID_RESPONSE", false, requestId);
    // Error details may contain private values. Expose only the safe error code.
    throw new ProfileReadFailure(response.status, error.code, error.retryable, requestId);
  }
  if (response.status !== 200 || "error" in value || !("data" in value)) throw new ProfileReadFailure(response.status, "INVALID_RESPONSE", false, requestId);
  if (signal.aborted) throw new ProfileReadFailure(0, "READ_CANCELLED");
  try { return parse(value.data); } catch { throw new ProfileReadFailure(response.status, "INVALID_RESPONSE", false, requestId); }
}
