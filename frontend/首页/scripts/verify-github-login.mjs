import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../../用户画像收集——前端/package.json", import.meta.url));
const { chromium } = require("playwright");
const build = process.env.MATCHER_AUTH_BUILD;
assert.ok(build && path.isAbsolute(build), "Provide the dedicated local Vite build directory.");
const out = fileURLToPath(new URL("../docs/github-login-20261112/", import.meta.url));
await fs.mkdir(out, { recursive: true });
const origin = "http://127.0.0.1:4199";
const bootstrap = { schema_version: 1, base_path: "/matcher/app", api_base: "/api/v1", native_home_url: "/dashboard", native_login_url: "/user/auth/login", csrf_header: "X-CSRF-Token", csrf_token: "synthetic-browser-only" };
const index = (await fs.readFile(path.join(build, "index.html"), "utf8")).replace("</head>", '<script id="matcher-webapp-bootstrap" type="application/json">' + JSON.stringify(bootstrap) + "</script></head>");
const meta = { request_id: "0123456789abcdef01234567" };
const sourceId = "11111111-2222-4333-a444-555555555555";
const success = (data) => ({ data, meta });
const failure = (code) => ({ error: { code, message: "UNTRUSTED_SYNTHETIC", retryable: false, details: [] }, meta });
const report = { passed: false, evidence: "Fully intercepted local build; synthetic API responses only", realNetworkCalls: 0, realOAuthCalls: 0, realEmails: 0, modelCalls: 0, checks: [], layouts: [], fonts: [], errors: [], screenshots: [] };
const browser = await chromium.launch({ headless: true });
const json = (route, status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
async function scenario(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const calls = { reads: [], mutations: [], oauth: 0 };
  page.on("pageerror", (error) => report.errors.push(error.message));
  await context.route("**/*", async (route) => {
    const request = route.request(); const url = new URL(request.url()); const p = url.pathname;
    try {
      assert.equal(url.origin, origin, "No external requests are permitted");
      if (p.includes("/assets/")) {
        const name = p.slice(p.lastIndexOf("/assets/") + 8); assert.equal(path.basename(name), name);
        const body = await fs.readFile(path.join(build, "assets", name));
        return route.fulfill({ status: 200, contentType: name.endsWith(".js") ? "text/javascript" : name.endsWith(".css") ? "text/css" : "font/woff2", body });
      }
      if (p === "/api/v1/auth/github/start") {
        assert.equal(request.method(), "GET"); assert.equal(request.isNavigationRequest(), true);
        assert.equal(url.searchParams.get("intent"), options.signedIn ? "bind" : "login"); assert.equal(url.searchParams.get("return_to"), "/matcher/app");
        calls.oauth++; return route.fulfill({ status: 200, contentType: "text/html", body: "<p>Synthetic OAuth navigation intercepted.</p>" });
      }
      if (p.startsWith("/matcher/app")) return route.fulfill({ status: 200, contentType: "text/html", body: index });
      if (request.method() !== "GET") {
        assert.equal(request.method(), "POST"); assert.equal(request.headers()["x-csrf-token"], bootstrap.csrf_token); calls.mutations.push(p);
        if (p === "/api/v1/auth/email-codes") {
          assert.equal(request.postDataJSON().purpose, options.signedIn ? "bind" : "login");
          return json(route, 202, success({ challenge_id: "challenge-" + "a".repeat(48), expires_in: 600, resend_after: 60 }));
        }
        if (p === "/api/v1/auth/email/verify") return json(route, 400, failure("CHALLENGE_INVALID"));
        throw new Error("Unexpected authentication mutation");
      }
      calls.reads.push(p);
      if (p === "/api/v1/me") return json(route, options.signedIn ? 200 : 401, options.signedIn ? success({ user_id: 1, nickname: "合成测试账号", identity_version: 0, avatar_ref: null }) : failure("AUTHENTICATION_REQUIRED"));
      if (p === "/api/v1/me/current-event") return json(route, 409, failure("CURRENT_EVENT_REQUIRED"));
      if (p === "/api/v1/auth/capabilities") return json(route, 200, success({ github_available: true, email_available: true }));
      if (p === "/api/v1/auth/github/import-status") return json(route, options.receiptError || 200, options.receiptError ? failure("AUTHENTICATION_REQUIRED") : success({ state: options.importState || "not_requested", source_id: options.withSource ? sourceId : null }));
      if (p === "/api/v1/me/profile/sources/" + sourceId + "/progress") return json(route, options.sourceDeleted ? 404 : 200, options.sourceDeleted ? failure("SOURCE_NOT_FOUND") : success({ id: sourceId, source_id: sourceId, kind: "github", status: options.sourceState === "failed" ? "failed" : "ready", progress: { schema_version: 1, state: options.sourceState || "ready", percent: null } }));
      throw new Error("Unexpected route: " + p);
    } catch (error) { report.errors.push(error.message); return route.abort(); }
  });
  await page.goto(origin + "/matcher/app" + (options.home ? "" : "/login") + (options.query || ""), { waitUntil: "networkidle" });
  await page.locator(options.home ? '[data-state="ready"]' : "[data-auth-purpose]").waitFor();
  return { page, context, calls };
}
function passed(name) { report.checks.push(name); }
try {
  const s = await scenario();
  for (const width of [1440, 768, 390, 320]) {
    await s.page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    for (const dark of [false, true]) {
      const current = await s.page.locator("html").evaluate((element) => element.classList.contains("dark"));
      if (current !== dark) await s.page.getByRole("button", { name: dark ? "切换夜间模式" : "切换日间模式" }).click();
      await s.page.evaluate(() => document.fonts.ready);
      const layout = await s.page.evaluate(() => {
        const visible = (el) => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
        const controls = [...document.querySelectorAll(".webapp-auth button,.webapp-auth input,.webapp-auth a")].filter(visible);
        return { viewport: innerWidth, scroll: document.documentElement.scrollWidth, undersized: controls.filter((el) => el.getBoundingClientRect().height < 44).length,
          overflow: controls.filter((el) => { const r = el.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).length,
          companionVisible: visible(document.querySelector(".webapp-auth-showcase")), inputFontSize: getComputedStyle(document.querySelector("#webapp-email")).fontSize,
          inputHeight: document.querySelector("#webapp-email").getBoundingClientRect().height,
          formWidth: document.querySelector(".webapp-auth-form").getBoundingClientRect().width,
          fontFilesLoaded: [...document.fonts].filter((font) => font.status === "loaded").map((font) => font.family) };
      });
      assert.ok(layout.scroll <= width + 1); assert.equal(layout.undersized, 0); assert.equal(layout.overflow, 0);
      assert.equal(layout.companionVisible, width >= 1024); assert.equal(layout.inputHeight, 44); assert.ok(layout.formWidth <= 400);
      if (width <= 600) assert.equal(layout.inputFontSize, "16px");
      const name = "login-" + width + (dark ? "-night" : "-day") + ".png";
      await s.page.screenshot({ path: path.join(out, name), fullPage: true }); report.screenshots.push(name); report.layouts.push({ dark, ...layout });
    }
  }
  passed("Four viewport widths, day/night, 44px controls, no overflow and 400px form");
  const cdp = await s.context.newCDPSession(s.page); await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
  const root = (await cdp.send("DOM.getDocument")).root.nodeId;
  for (const selector of [".webapp-auth-heading h1", ".webapp-auth-github", ".webapp-brand"]) {
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root, selector });
    report.fonts.push({ selector, fonts: (await cdp.send("CSS.getPlatformFontsForNode", { nodeId })).fonts });
  }
  assert.ok(report.fonts[0].fonts.some((font) => font.glyphCount > 0)); passed("Actual rendered Chinese and Latin font families recorded via Chromium");
  await s.page.keyboard.press("Tab");
  await s.page.getByLabel("邮箱地址", { exact: true }).fill("synthetic@example.invalid");
  await s.page.getByRole("button", { name: "发送验证码", exact: true }).click();
  const code = s.page.getByLabel("6 位验证码", { exact: true }); await code.waitFor(); assert.equal(await code.evaluate((el) => el === document.activeElement), true);
  await code.fill("000000"); await s.page.getByRole("button", { name: "验证并登录", exact: true }).click();
  await s.page.getByRole("alert").filter({ hasText: "验证码不正确或已失效" }).waitFor();
  assert.equal(s.calls.mutations.length, 2); assert.equal(s.calls.oauth, 0); assert.equal(s.calls.reads.includes("/api/v1/auth/github/import-status"), false);
  passed("OTP input focus, explicit synthetic send/verify, error display; guests never read import status"); await s.context.close();

  const cancelled = await scenario({ query: "?auth_error=cancelled" });
  await cancelled.page.getByRole("alert").filter({ hasText: "你已取消 GitHub 授权" }).waitFor();
  await cancelled.page.getByRole("button", { name: "使用 GitHub 登录", exact: true }).click();
  await cancelled.page.waitForURL("**/api/v1/auth/github/start?**"); assert.equal(cancelled.calls.oauth, 1);
  passed("Cancelled OAuth feedback and explicit safe GitHub navigation"); await cancelled.context.close();

  for (const state of ["pending", "running", "failed", "skipped_existing", "revoked", "unavailable"]) {
    const current = await scenario({ signedIn: true, importState: state });
    await current.page.locator('[data-import-state="' + state + '"]').waitFor();
    assert.equal(current.calls.mutations.length, 0); assert.equal(current.calls.reads.filter((url) => url.endsWith("import-status")).length, 1);
    await current.page.getByRole("button", { name: "重新读取状态", exact: true }).click();
    await current.page.locator('[data-import-state="' + state + '"]').waitFor();
    assert.equal(current.calls.reads.filter((url) => url.endsWith("import-status")).length, 2); assert.equal(current.calls.mutations.length, 0);
    passed("Stored " + state + " receipt is visible; explicit refresh remains read-only"); await current.context.close();
  }
  for (const options of [{ home: true, withSource: true, importState: "succeeded" }, { home: true, withSource: true, importState: "succeeded", sourceDeleted: true }]) {
    const current = await scenario({ signedIn: true, ...options });
    const state = options.sourceDeleted ? "revoked" : "succeeded";
    await current.page.locator('[data-import-state="' + state + '"]').waitFor();
    assert.ok(current.calls.reads.some((url) => url.endsWith("/progress"))); assert.equal(current.calls.mutations.length, 0);
    const name = "import-" + state + "-synthetic.png"; await current.page.screenshot({ path: path.join(out, name), fullPage: true }); report.screenshots.push(name);
    passed("Home source state " + state + " uses existing P1 progress"); await current.context.close();
  }
  const denied = await scenario({ signedIn: true, receiptError: 401 }); await denied.page.locator('[data-import-state="session"]').waitFor();
  assert.equal(await denied.page.getByRole("link", { name: "前往资料页" }).count(), 0); passed("Lost session hides prior source actions"); await denied.context.close();
  assert.deepEqual(report.errors, []); report.passed = true;
} finally {
  await browser.close(); await fs.writeFile(path.join(out, "verification.json"), JSON.stringify(report, null, 2) + "\n");
}
console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, screenshots: report.screenshots.length, realNetworkCalls: 0, output: out }));
