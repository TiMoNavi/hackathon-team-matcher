import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Reuse the installed browser tool only. Never read its page, data or source.
const require = createRequire(new URL("../../用户画像收集——前端/package.json", import.meta.url));
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.MATCHER_WEBAPP_TEST_URL;
assert.ok(base, "Set MATCHER_WEBAPP_TEST_URL to the approved isolated page.");
const address = new URL(base);
assert.ok(["127.0.0.1", "localhost"].includes(address.hostname) && address.port === "8113");
assert.equal(address.pathname, "/matcher/app");
const out = fileURLToPath(new URL("../artifacts/n04/auth/", import.meta.url));
await fs.mkdir(out, { recursive: true });
const report = { date: new Date().toISOString(), passed: false, realReads: [], checks: [], viewports: [], screenshots: [], pageErrors: [], blockedNetwork: [], routeContractFailures: [], mockMutations: 0 };
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
const record = (value) => report.checks.push(value);
const meta = { request_id: "0123456789abcdef01234567" };
const challenge = { challenge_id: "challenge-" + "a".repeat(48), expires_in: 600, resend_after: 60 };
const success = (data) => ({ data, meta });
const failure = (code, details = []) => ({ error: { code, message: "UNTRUSTED_PROVIDER_TEXT", retryable: false, details }, meta });
const fulfill = (route, status, payload) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function observe(page) { page.on("pageerror", (error) => report.pageErrors.push(error.message)); }
async function layout(page, width, dark) {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
  if (dark !== await page.locator("html").evaluate((element) => element.classList.contains("dark"))) await page.getByRole("button", { name: dark ? "切换夜间模式" : "切换日间模式" }).click();
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(250);
  const metrics = await page.evaluate(() => {
    const visible = (element) => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0;
    const controls = [...document.querySelectorAll(".webapp-auth button,.webapp-auth input,.webapp-auth a,.webapp-tabs a")].filter(visible);
    return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, undersized: controls.filter((element) => element.getBoundingClientRect().height < 44).map((element) => element.tagName), clipped: controls.filter((element) => { const rect = element.getBoundingClientRect(); return rect.left < -1 || rect.right > innerWidth + 1; }).map((element) => element.tagName), emailFontSize: getComputedStyle(document.querySelector("#webapp-email")).fontSize, companionVisible: visible(document.querySelector(".webapp-auth-aside")), background: getComputedStyle(document.body).backgroundColor };
  });
  assert.ok(metrics.scrollWidth <= width + 1, "Login layout must not scroll horizontally"); assert.deepEqual(metrics.clipped, []); assert.deepEqual(metrics.undersized, []);
  assert.equal(metrics.companionVisible, width >= 1024); if (width <= 600) assert.equal(metrics.emailFontSize, "16px");
  assert.equal(await page.locator("#webapp-email").inputValue(), "", "Only a blank form may be captured");
  report.viewports.push({ dark, ...metrics });
  const file = `auth-blank-${width}-${dark ? "night" : "day"}.png`;
  await page.screenshot({ path: path.join(out, file), fullPage: true }); report.screenshots.push(file);
}

// Every non-GET and OAuth start is intercepted in synthetic contexts. No
// addresses, codes, CSRF values, response bodies or provider text are persisted.
async function scenario(options = {}) {
  const state = { loggedIn: Boolean(options.loggedIn), sends: 0, verifies: 0, logouts: 0, oauth: 0, capabilities: 0, documents: 0, requests: [] };
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); observe(page);
  await context.route("**/*", async (route) => {
    try {
    const request = route.request(); const url = new URL(request.url()); const pathname = url.pathname;
    if (url.origin !== address.origin) { report.blockedNetwork.push({ path: pathname, reason: "cross-origin" }); return route.abort(); }
    if (request.isNavigationRequest() && pathname.startsWith("/matcher/app")) state.documents++;
    if (pathname === "/api/v1/me") return fulfill(route, state.loggedIn ? 200 : 401, state.loggedIn ? success({ user_id: 1, nickname: "合成测试账号", identity_version: 0, avatar_ref: null }) : failure("AUTHENTICATION_REQUIRED"));
    if (pathname === "/api/v1/me/current-event") return fulfill(route, 409, failure("CURRENT_EVENT_REQUIRED"));
    if (pathname === "/api/v1/auth/capabilities") { state.capabilities++; if (options.capabilityFailsOnce && state.capabilities === 1) return fulfill(route, 503, failure("AUTH_UNAVAILABLE")); return fulfill(route, 200, success({ email_available: true, github_available: true })); }
    if (pathname === "/api/v1/auth/github/start") {
      assert.equal(request.method(), "GET"); assert.equal(request.isNavigationRequest(), true);
      assert.equal(url.searchParams.get("intent"), state.loggedIn ? "bind" : "login"); assert.equal(url.searchParams.get("return_to"), address.pathname);
      state.oauth++; return route.fulfill({ status: 200, contentType: "text/html", body: "<p>Intercepted synthetic OAuth navigation</p>" });
    }
    if (request.method() !== "GET") {
      assert.ok(["/api/v1/auth/email-codes", "/api/v1/auth/email/verify", "/api/v1/auth/logout"].includes(pathname), "Unexpected mutation endpoint");
      assert.equal(request.method(), "POST");
      const csrf = await page.locator("#matcher-webapp-bootstrap").evaluate((element) => JSON.parse(element.textContent).csrf_token);
      assert.ok(csrf && request.headers()["x-csrf-token"] === csrf, "CSRF must match the current document bootstrap");
      const body = request.postDataJSON(); report.mockMutations++; state.requests.push(pathname);
      if (pathname.endsWith("email-codes")) {
        state.sends++; assert.ok(body.email === "synthetic@example.invalid" && body.purpose === (state.loggedIn ? "bind" : "login") && body.return_to === address.pathname, "Send payload must match current intent");
        await wait(100); return fulfill(route, 202, success(challenge));
      }
      if (pathname.endsWith("email/verify")) {
        state.verifies++; assert.ok(body.challenge_id === challenge.challenge_id && body.code === "000000" && Object.keys(body).length === 2, "Verify payload must contain only challenge and code");
        if (options.verifyStatus) return fulfill(route, options.verifyStatus, failure(options.verifyCode || "INVALID_CODE", options.verifyDetails || []));
        return fulfill(route, 200, success({ authenticated: true, bound: state.loggedIn, next_url: options.nextUrl || address.pathname }));
      }
      state.logouts++; assert.ok(Object.keys(body).length === 0, "Logout has no caller-supplied identity"); state.loggedIn = false; return fulfill(route, 200, success({ authenticated: false }));
    }
    return route.continue();
    } catch (error) { report.routeContractFailures.push(error.message); return route.abort(); }
  });
  await page.goto(`${base}/login`, { waitUntil: "networkidle" }); await page.locator("[data-auth-purpose]").waitFor();
  return { page, context, state };
}
async function sendChallenge(page) { await page.getByLabel("邮箱地址", { exact: true }).fill("synthetic@example.invalid"); await page.getByRole("button", { name: "发送验证码", exact: true }).click(); await page.getByLabel("6 位验证码", { exact: true }).waitFor(); }
async function verifyChallenge(page) { await page.getByLabel("6 位验证码", { exact: true }).fill("000000"); await page.getByRole("button", { name: "验证并登录", exact: true }).click(); }

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(); observe(page);
  await context.route("**/*", (route) => {
    const request = route.request(); const url = new URL(request.url());
    if (url.origin !== address.origin || request.method() !== "GET" || url.pathname.includes("/auth/github/")) { report.blockedNetwork.push({ path: url.pathname, reason: "real context read-only guard" }); return route.abort(); }
    return route.continue();
  });
  page.on("response", (response) => { const pathname = new URL(response.url()).pathname; if (pathname.startsWith("/api/v1/")) report.realReads.push({ path: pathname, status: response.status() }); });
  const response = await page.goto(`${base}/login`, { waitUntil: "networkidle" }); assert.equal(response.status(), 200); await page.locator('[data-auth-purpose="login"]').waitFor();
  assert.ok(report.realReads.some((entry) => entry.path === "/api/v1/me" && entry.status === 401));
  assert.ok(report.realReads.some((entry) => entry.path === "/api/v1/auth/capabilities" && entry.status === 200));
  assert.equal(await page.getByRole("link", { name: "使用原站登录入口" }).getAttribute("href"), "/user/auth/login");
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0); record("Real 401 and capabilities 200 render a blank login form with native fallback and no persisted data");
  for (const width of [1440, 768, 390, 320]) { await layout(page, width, false); await layout(page, width, true); }
  assert.notEqual(report.viewports[0].background, report.viewports[1].background); record("Blank login passes four viewport widths, day/night, 44px controls and 16px mobile inputs");
  await page.reload({ waitUntil: "networkidle" }); await page.locator("[data-auth-purpose]").waitFor(); await page.keyboard.press("Tab"); assert.equal(await page.evaluate(() => document.activeElement?.textContent), "跳到正文"); await page.keyboard.press("Enter"); assert.equal(await page.evaluate(() => document.activeElement?.id), "webapp-main"); record("Keyboard skip link reaches login content");
  await context.close();

  const rate = await scenario({ verifyStatus: 429, verifyCode: "RATE_LIMITED", verifyDetails: { retry_after: 120 } });
  await rate.page.getByLabel("邮箱地址", { exact: true }).fill("invalid"); await rate.page.getByRole("button", { name: "发送验证码", exact: true }).click(); await rate.page.getByText("请输入有效的邮箱地址。", { exact: true }).waitFor(); assert.equal(rate.state.sends, 0);
  await rate.page.getByLabel("邮箱地址", { exact: true }).fill("synthetic@example.invalid"); await rate.page.getByRole("button", { name: "发送验证码", exact: true }).evaluate((button) => { button.click(); button.click(); }); await rate.page.getByLabel("6 位验证码", { exact: true }).waitFor(); assert.equal(rate.state.sends, 1);
  assert.equal(await rate.page.getByRole("button", { name: /秒后可重发/ }).isDisabled(), true); assert.equal(await rate.page.evaluate(() => document.activeElement?.id), "webapp-code");
  await rate.page.getByLabel("6 位验证码", { exact: true }).fill("00000"); await rate.page.getByRole("button", { name: "验证并登录", exact: true }).click(); assert.equal(rate.state.verifies, 0);
  await verifyChallenge(rate.page); await rate.page.getByText("操作过于频繁，请等待后再试。", { exact: true }).waitFor(); assert.equal(await rate.page.getByRole("button", { name: "验证并登录", exact: true }).isDisabled(), true); await wait(100); assert.equal(rate.state.verifies, 1);
  assert.equal(await rate.page.getByLabel("6 位验证码", { exact: true }).inputValue(), ""); assert.equal(await rate.page.evaluate(() => localStorage.length + sessionStorage.length), 0); record("Synthetic invalid input, duplicate click, cooldown, code clearing and rate-limit lock send no extra requests");
  await rate.page.getByRole("link", { name: "活动入口", exact: true }).click(); await rate.page.locator('[data-state="signed-out"]').waitFor(); await rate.page.goBack(); await rate.page.locator("[data-auth-purpose]").waitFor(); assert.equal(await rate.page.getByLabel("邮箱地址", { exact: true }).inputValue(), ""); assert.equal(rate.state.verifies, 1); record("Leaving and returning discards ephemeral email and code without retrying"); await rate.context.close();

  const registration = await scenario({ verifyStatus: 409, verifyCode: "REGISTRATION_REQUIRED", verifyDetails: { next_url: "/user/registration" } });
  await sendChallenge(registration.page); await verifyChallenge(registration.page); const registrationLink = registration.page.getByRole("link", { name: "补充注册资料" }); await registrationLink.waitFor(); assert.equal(await registrationLink.getAttribute("href"), "/user/registration"); assert.equal(new URL(registration.page.url()).pathname, "/matcher/app/login"); assert.equal(registration.state.documents, 1); record("Synthetic registration-required shows only the explicit approved link, without successful-login navigation"); await registration.context.close();

  const unapproved = await scenario({ verifyStatus: 409, verifyCode: "REGISTRATION_REQUIRED", verifyDetails: { next_url: "//outside.invalid" } });
  await sendChallenge(unapproved.page); await verifyChallenge(unapproved.page); await unapproved.page.getByText("这次操作未完成，请检查后重试。", { exact: true }).waitFor(); assert.equal(await unapproved.page.getByRole("link", { name: "补充注册资料" }).count(), 0); assert.equal(unapproved.state.documents, 1); record("Synthetic unapproved registration target is never rendered or followed"); await unapproved.context.close();

  const invalidReceipt = await scenario({ nextUrl: "https://outside.invalid" });
  await sendChallenge(invalidReceipt.page); await verifyChallenge(invalidReceipt.page); await invalidReceipt.page.getByText("未能确认服务返回的结果，请刷新页面后检查状态。", { exact: true }).waitFor(); assert.equal(invalidReceipt.state.documents, 1); record("Synthetic unsafe successful receipt remains an error and cannot navigate"); await invalidReceipt.context.close();

  const validReceipt = await scenario(); await sendChallenge(validReceipt.page); await verifyChallenge(validReceipt.page); await validReceipt.page.waitForURL(base); assert.equal(validReceipt.state.documents, 2); record("Synthetic valid receipt performs full app-root navigation to refresh bootstrap"); await validReceipt.context.close();

  const oauth = await scenario(); assert.equal(oauth.state.oauth, 0); await oauth.page.getByRole("button", { name: "使用 GitHub 登录", exact: true }).click(); await oauth.page.waitForURL((url) => url.pathname === "/api/v1/auth/github/start"); assert.equal(oauth.state.oauth, 1); record("GitHub starts only on explicit click with login intent; destination is intercepted locally"); await oauth.context.close();

  const bind = await scenario({ loggedIn: true }); await bind.page.getByRole("heading", { name: "关联登录方式", exact: true }).waitFor(); await bind.page.getByLabel("要关联的邮箱", { exact: true }).fill("synthetic@example.invalid"); await bind.page.getByRole("button", { name: "发送验证码", exact: true }).click(); await bind.page.getByLabel("6 位验证码", { exact: true }).waitFor(); await bind.page.getByLabel("6 位验证码", { exact: true }).fill("000000"); await bind.page.getByRole("button", { name: "验证并关联邮箱", exact: true }).click(); await bind.page.waitForURL(base); assert.equal(bind.state.verifies, 1);
  await bind.page.goto(`${base}/login`, { waitUntil: "networkidle" }); await bind.page.getByRole("button", { name: "退出当前账号", exact: true }).click(); assert.equal(bind.state.logouts, 0); await bind.page.getByRole("button", { name: "确认退出", exact: true }).click(); await bind.page.waitForURL(base); await bind.page.locator('[data-state="signed-out"]').waitFor(); assert.equal(bind.state.logouts, 1); record("Synthetic signed-in flow preserves bind intent and performs logout only after confirmation"); await bind.context.close();

  const unavailable = await scenario({ capabilityFailsOnce: true }); await unavailable.page.getByText("暂时无法读取登录方式。", { exact: true }).waitFor(); assert.equal(unavailable.state.capabilities, 1); await unavailable.page.getByRole("button", { name: "重新读取登录方式", exact: true }).click(); await unavailable.page.waitForFunction(() => !document.querySelector("#webapp-email").disabled); assert.equal(unavailable.state.capabilities, 2); assert.equal(unavailable.state.sends, 0); record("Capability failure recovers through one explicit read and performs no mutation"); await unavailable.context.close();

  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.blockedNetwork, []); assert.deepEqual(report.routeContractFailures, []); record("No application exception, unapproved network request, real email request or external OAuth navigation"); report.passed = true;
} catch (error) { report.failure = error.message; throw error; }
finally { await browser.close(); await fs.writeFile(path.join(out, "auth-browser-report.json"), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, mockMutations: report.mockMutations, report: "artifacts/n04/auth/auth-browser-report.json" })); }
