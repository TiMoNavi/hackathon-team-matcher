export type Bootstrap = Readonly<{
  schema_version: 1;
  base_path: string;
  api_base: string;
  native_home_url: string;
  native_login_url: string;
  csrf_header: "X-CSRF-Token";
  csrf_token: string;
}>;
export type Identity = Readonly<{ user_id: number; nickname: string | null; identity_version: number; avatar_ref: string | null }>;
export type CurrentEvent = Readonly<{ space_id: number; selection_revision: string; access_version: string }>;
export type ErrorDetails = Record<string, unknown> | [];
export type ApiError = Readonly<{ code: string; message: string; retryable: boolean; details: ErrorDetails }>;
export type Envelope<T> = { data: T; meta: { request_id: string } };

export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const positiveId = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 2147483647;
const nullableText = (value: unknown): value is string | null => value === null || typeof value === "string";

export function sameOriginUrl(value: unknown, origin: string): URL {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020]/.test(value)) throw new Error("Invalid same-origin URL.");
  const url = new URL(value, origin);
  if (url.origin !== origin || url.username || url.password || url.hash) throw new Error("Invalid same-origin URL.");
  return url;
}

export function parseBootstrap(value: unknown, origin: string): Bootstrap {
  if (!object(value) || value.schema_version !== 1 || value.csrf_header !== "X-CSRF-Token" || typeof value.csrf_token !== "string" || !value.csrf_token || value.csrf_token.length > 4096) throw new Error("Invalid application bootstrap.");
  const base = sameOriginUrl(value.base_path, origin);
  const api = sameOriginUrl(value.api_base, origin);
  const home = sameOriginUrl(value.native_home_url, origin);
  const login = sameOriginUrl(value.native_login_url, origin);
  if (!base.pathname.endsWith("/matcher/app") || base.search || !api.pathname.endsWith("/api/v1") || api.search) throw new Error("Invalid application paths.");
  const prefix = base.pathname.slice(0, -"/matcher/app".length);
  if (api.pathname !== `${prefix}/api/v1`) throw new Error("Mismatched application paths.");
  const nativeRoute = (url: URL, route: string) => url.pathname === `${prefix}/${route}` && !url.search || url.pathname === `${prefix}/index.php` && url.searchParams.get("r") === route && [...url.searchParams.keys()].every((key) => key === "r");
  const dashboardAlias = home.pathname === `${prefix}/dashboard` && !home.search;
  if (!(nativeRoute(home, "dashboard/dashboard") || dashboardAlias) || !nativeRoute(login, "user/auth/login")) throw new Error("Invalid native fallback.");
  return Object.freeze({ schema_version: 1, base_path: base.pathname, api_base: api.pathname, native_home_url: home.pathname + home.search, native_login_url: login.pathname + login.search, csrf_header: "X-CSRF-Token", csrf_token: value.csrf_token });
}

export function parseIdentity(value: unknown): Identity {
  if (!object(value) || !positiveId(value.user_id) || !nullableText(value.nickname) || !Number.isSafeInteger(value.identity_version) || Number(value.identity_version) < 0 || !nullableText(value.avatar_ref)) throw new Error("Invalid identity response.");
  return { user_id: value.user_id, nickname: value.nickname, identity_version: Number(value.identity_version), avatar_ref: value.avatar_ref };
}
export function parseCurrentEvent(value: unknown): CurrentEvent {
  if (!object(value) || !positiveId(value.space_id) || typeof value.selection_revision !== "string" || !/^selection-[a-f0-9]{32}$/.test(value.selection_revision) || typeof value.access_version !== "string" || !value.access_version || value.access_version.length > 512) throw new Error("Invalid current-event response.");
  return { space_id: value.space_id, selection_revision: value.selection_revision, access_version: value.access_version };
}
export function requestId(value: unknown): string {
  if (!object(value) || !object(value.meta) || typeof value.meta.request_id !== "string" || !/^[a-f0-9]{24}$/.test(value.meta.request_id)) throw new Error("Invalid response metadata.");
  return value.meta.request_id;
}
export function parseApiError(value: unknown): ApiError {
  if (!object(value) || typeof value.code !== "string" || !value.code || typeof value.message !== "string" || typeof value.retryable !== "boolean" || !(object(value.details) || Array.isArray(value.details) && value.details.length === 0)) throw new Error("Invalid error response.");
  return { code: value.code, message: value.message, retryable: value.retryable, details: value.details as ErrorDetails };
}
