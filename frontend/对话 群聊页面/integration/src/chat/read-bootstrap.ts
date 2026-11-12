import { safeInteger } from "./contracts.js";

/** Separate from C03's eight-field shell. actor_id partitions volatile state;
 * it never grants access to a conversation or enables a write capability. */
export type ReadBootstrap = Readonly<{
  schema_version: 2; integration_stage: "read"; base_path: "/matcher/chat"; api_base: "/api/v1";
  native_home_url: string; native_login_url: string; native_chat_url: string;
  csrf_header: "X-CSRF-Token"; csrf_token: string; actor_id: number;
}>;
const fields = ["schema_version", "integration_stage", "base_path", "api_base", "native_home_url", "native_login_url", "native_chat_url", "csrf_header", "csrf_token", "actor_id"];
function invalid(): never { throw new Error("Invalid read-only chat bootstrap."); }
function nativeLink(value: unknown, origin: string, route: string, alias?: string): string {
  if (typeof value !== "string" || value.length > 512 || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/u.test(value)) return invalid();
  let url: URL;
  try { url = new URL(value, origin); } catch { return invalid(); }
  if (url.origin !== origin || url.username || url.password || url.hash) return invalid();
  const plain = value === `/${route}` || alias !== undefined && value === alias;
  const front = value.startsWith("/index.php?") && url.pathname === "/index.php" && url.searchParams.getAll("r").length === 1
    && url.searchParams.get("r") === route && [...url.searchParams.keys()].every((key) => key === "r");
  if (!plain && !front) return invalid();
  return value;
}
export function parseReadBootstrap(value: unknown, origin: string): ReadBootstrap {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return invalid();
  const input = value as Record<string, unknown>;
  if (Reflect.ownKeys(input).length !== fields.length || fields.some((key) => !Object.hasOwn(input, key))) return invalid();
  if (input.schema_version !== 2 || input.integration_stage !== "read" || input.base_path !== "/matcher/chat" || input.api_base !== "/api/v1" || input.csrf_header !== "X-CSRF-Token") return invalid();
  if (typeof input.csrf_token !== "string" || !input.csrf_token || input.csrf_token.length > 4096 || /[\u0000-\u0020\u007f]/u.test(input.csrf_token)) return invalid();
  let actor: number;
  try { actor = safeInteger(input.actor_id, 1); } catch { return invalid(); }
  return Object.freeze({ schema_version: 2, integration_stage: "read", base_path: "/matcher/chat", api_base: "/api/v1", csrf_header: "X-CSRF-Token", csrf_token: input.csrf_token, actor_id: actor,
    native_home_url: nativeLink(input.native_home_url, origin, "dashboard/dashboard", "/dashboard"),
    native_login_url: nativeLink(input.native_login_url, origin, "user/auth/login"),
    native_chat_url: nativeLink(input.native_chat_url, origin, "mail/mail/index") });
}
