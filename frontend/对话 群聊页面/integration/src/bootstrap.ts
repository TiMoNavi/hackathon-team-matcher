export type ChatBootstrap = Readonly<{
  schema_version: 1;
  integration_stage: "shell";
  base_path: "/matcher/chat";
  api_base: "/api/v1";
  native_home_url: string;
  native_login_url: string;
  csrf_header: "X-CSRF-Token";
  csrf_token: string;
}>;

const fields = [
  "schema_version", "integration_stage", "base_path", "api_base",
  "native_home_url", "native_login_url", "csrf_header", "csrf_token",
] as const;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nativePath(value: unknown, origin: string, route: string): string {
  if (typeof value !== "string" || value.length > 512 || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/u.test(value)) {
    throw new Error("Invalid native link.");
  }
  let url: URL;
  try { url = new URL(value, origin); } catch { throw new Error("Invalid native link."); }
  if (url.origin !== origin || url.username || url.password || url.hash) throw new Error("Invalid native link.");
  // Only the two server-provided native destinations are permitted. No return URL.
  const clean = value === "/" + route || route === "dashboard/dashboard" && value === "/dashboard";
  const frontController = value.startsWith("/index.php?") && url.pathname === "/index.php" &&
    url.searchParams.getAll("r").length === 1 && url.searchParams.get("r") === route &&
    Array.from(url.searchParams.keys()).every((key) => key === "r");
  if (!clean && !frontController) throw new Error("Invalid native link.");
  return value;
}

export function parseBootstrap(value: unknown, origin: string): ChatBootstrap {
  if (!object(value) || Object.keys(value).length !== fields.length || fields.some((key) => !Object.hasOwn(value, key))) {
    throw new Error("Invalid chat bootstrap.");
  }
  if (value.schema_version !== 1 || value.integration_stage !== "shell" || value.base_path !== "/matcher/chat" || value.api_base !== "/api/v1" || value.csrf_header !== "X-CSRF-Token") {
    throw new Error("Invalid chat bootstrap.");
  }
  if (typeof value.csrf_token !== "string" || value.csrf_token.length < 1 || value.csrf_token.length > 4096 || /[\u0000-\u0020\u007f]/u.test(value.csrf_token)) {
    throw new Error("Invalid chat bootstrap.");
  }
  return Object.freeze({
    schema_version: 1, integration_stage: "shell", base_path: "/matcher/chat", api_base: "/api/v1",
    native_home_url: nativePath(value.native_home_url, origin, "dashboard/dashboard"),
    native_login_url: nativePath(value.native_login_url, origin, "user/auth/login"),
    csrf_header: "X-CSRF-Token", csrf_token: value.csrf_token,
  });
}

export function parseShellPath(pathname: string): "index" | "conversation" {
  if (pathname === "/matcher/chat") return "index";
  const match = /^\/matcher\/chat\/conversations\/([1-9][0-9]{0,18})$/.exec(pathname);
  if (!match || match[1].length === 19 && match[1] > "9223372036854775807") throw new Error("Invalid chat path.");
  // The path preserves position only; it never proves identity or permission.
  return "conversation";
}
