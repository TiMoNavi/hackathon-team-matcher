import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Actual existing build, ephemeral loopback fixture, no real session or service.
// The script never builds assets, calls a model, or persists request payloads.
const root = fileURLToPath(new URL("../../../", import.meta.url));
const require = createRequire(path.join(root, "frontend/用户画像收集——前端/package.json"));
const { chromium } = require("playwright");
const assets = path.join(root, "backend/protected/modules/matcher-webapp/resources/app");
const output = path.join(root, "frontend/integration/artifacts/n05/event-access-browser");
const manifestBytes = await fs.readFile(path.join(assets, "manifest.json"));
const entry = JSON.parse(manifestBytes.toString("utf8"))["index.html"];
assert.ok(typeof entry?.file === "string" && Array.isArray(entry.css), "Missing application build entry.");
const safeAsset = (file) => { const result = path.resolve(assets, file); if (!result.startsWith(assets + path.sep)) throw new Error("INVALID_ASSET_PATH"); return result; };
const hashes = { manifest: createHash("sha256").update(manifestBytes).digest("hex"), js: createHash("sha256").update(await fs.readFile(safeAsset(entry.file))).digest("hex") };
const bootstrap = { schema_version: 1, base_path: "/matcher/app", api_base: "/api/v1", native_home_url: "/dashboard", native_login_url: "/user/auth/login", csrf_header: "X-CSRF-Token", csrf_token: "synthetic-event-browser-only" };
const html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + entry.css.map((file) => '<link rel="stylesheet" href="/test-assets/' + file + '">').join("") + '</head><body><div id="matcher-webapp-root"></div><script id="matcher-webapp-bootstrap" type="application/json">' + JSON.stringify(bootstrap) + '</script><script type="module" src="/test-assets/' + entry.file + '"></script></body></html>';
const meta = { request_id: "0123456789abcdef01234567" };
const revisionA = "selection-" + "a".repeat(32), revisionB = "selection-" + "b".repeat(32);
const eventA = { space_id: 7, name: "虚构周末协作活动：一起讨论、设计和完成可以展示的小作品", membership_id: 10, membership_role: "member" };
const eventB = { space_id: 8, name: "虚构开源协作活动", membership_id: 20, membership_role: "member" };
const invitation = "S".repeat(43);
const receipt = { receipt_id: "receipt-" + "c".repeat(32), invitation_id: "inv-" + "d".repeat(32), space_id: 7, membership_id: 10, outcome: "joined", consumed_use: true, created_at: "2026-11-12T12:00:00Z", membership_current: true };
const report = { checked_at: new Date().toISOString(), status: "running", scope: "Actual compiled host and synthetic same-origin API; not real authentication, database or membership acceptance", assets: { entry: entry.file, css: entry.css, sha256: hashes }, checks: [], scenarios: [], viewports: [], screenshots: [], page_error_count: 0, blocked_external_count: 0, fixture_contract_failures: 0, unexpected_route_count: 0, model_requests: 0, failure: null };
let scenarioId = "setup", checkpoint = "setup", activeState = null, browser = null;
const record = (name) => report.checks.push({ scenario: scenarioId, check: name });
const success = (res, data) => { res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify({ data, meta })); };
const failure = (res, status, code, details = []) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify({ error: { code, message: "Synthetic fixture response", retryable: false, details }, meta })); };
const verify = (condition) => { if (!condition) throw new Error("FIXTURE_CONTRACT_FAILED"); };
const readBody = async (req) => { const chunks = []; let bytes = 0; for await (const chunk of req) { bytes += chunk.length; verify(bytes <= 4096); chunks.push(chunk); } return JSON.parse(Buffer.concat(chunks).toString("utf8")); };
const selectedDto = (state) => ({ space_id: state.current === "B" ? 8 : 7, selection_revision: state.revision, access_version: "synthetic-event-access" });
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname.startsWith("/test-assets/") && req.method === "GET") {
      const file = safeAsset(url.pathname.slice("/test-assets/".length));
      const mime = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : file.endsWith(".svg") ? "image/svg+xml" : file.endsWith(".png") ? "image/png" : file.endsWith(".webp") ? "image/webp" : "font/woff2";
      res.writeHead(200, { "Content-Type": mime }); res.end(await fs.readFile(file)); return;
    }
    if (url.pathname.startsWith("/matcher/app") && req.method === "GET") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }); res.end(html); return; }
    if (url.pathname === "/favicon.ico") { res.writeHead(204); res.end(); return; }
    verify(activeState !== null); const state = activeState;
    if (req.method === "GET" && url.pathname === "/api/v1/me") { state.counts.me++; return state.guest ? failure(res, 401, "AUTHENTICATION_REQUIRED") : success(res, { user_id: 1, nickname: "虚构活动浏览器测试账号", identity_version: 1, avatar_ref: null }); }
    if (req.method === "GET" && url.pathname === "/api/v1/auth/github/import-status") return success(res, { state: "not_requested", source_id: null });
    if (req.method === "GET" && url.pathname === "/api/v1/me/events") {
      state.counts.members++; verify(url.searchParams.get("limit") === "24" && !url.searchParams.has("cursor"));
      return state.denyMembers ? failure(res, 403, "ACCESS_DENIED") : success(res, { items: state.members, next_cursor: null, has_more: false, limit: 24 });
    }
    if (req.method === "GET" && url.pathname === "/api/v1/me/current-event") {
      state.counts.current++;
      if (state.current === "none") return failure(res, 409, "CURRENT_EVENT_REQUIRED");
      if (state.current === "denied") return failure(res, 403, "ACCESS_DENIED");
      if (state.current === "revoked") return failure(res, 403, "CURRENT_EVENT_ACCESS_REVOKED", { selection_revision: state.revision });
      return success(res, selectedDto(state));
    }
    if (req.method === "POST" && url.pathname === "/api/v1/event-invitations/redeem") {
      state.counts.join++; verify(req.headers["x-csrf-token"] === bootstrap.csrf_token && /^[A-Za-z0-9._:-]{8,128}$/.test(String(req.headers["idempotency-key"] || "")));
      verify(req.headers["content-type"] === "application/json"); const body = await readBody(req);
      verify(Object.keys(body).sort().join(",") === "confirmation_intent,token" && body.confirmation_intent === "join" && body.token === invitation);
      if (state.oldReceipt) return success(res, { ...receipt, membership_current: false });
      state.members = [eventA]; return success(res, receipt);
    }
    if (req.method === "PUT" && url.pathname === "/api/v1/me/current-event") {
      state.counts.select++; verify(req.headers["x-csrf-token"] === bootstrap.csrf_token && req.headers["content-type"] === "application/json");
      const body = await readBody(req); verify(Object.keys(body).sort().join(",") === "expected_revision,space_id");
      verify(state.members.some((item) => item.space_id === body.space_id)); verify(body.expected_revision === (state.current === "none" ? null : state.revision));
      state.selectionUsedObservedRevision = state.current === "revoked" && body.expected_revision === state.revision;
      state.current = body.space_id === 8 ? "B" : "A"; state.revision = revisionB; return success(res, selectedDto(state));
    }
    if (req.method === "GET" && /^\/api\/v1\/events\/(7|8)\/discovery$/.test(url.pathname)) {
      state.counts.discovery++; verify(["A", "B"].includes(state.current)); const space = state.current === "B" ? 8 : 7;
      verify(url.pathname === "/api/v1/events/" + space + "/discovery");
      return success(res, { space_id: space, target_type: "person", sort: "recent", limit: 24, items: [], next_cursor: null, has_more: false, exhausted: true });
    }
    if (req.method !== "GET") state.counts.unexpectedWrites++;
    report.unexpected_route_count++; return failure(res, 404, "SYNTHETIC_ROUTE_UNAVAILABLE");
  } catch { report.fixture_contract_failures++; if (!res.headersSent) failure(res, 500, "SYNTHETIC_FIXTURE_FAILURE"); else res.end(); }
});
await fs.mkdir(output, { recursive: true });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port;
const fixture = (options = {}) => ({ guest: false, current: "none", revision: revisionA, members: [], denyMembers: false, oldReceipt: false, selectionUsedObservedRevision: false, counts: { me: 0, current: 0, members: 0, join: 0, select: 0, discovery: 0, unexpectedWrites: 0 }, ...options });
async function scenario(name, options, run, route = "") {
  scenarioId = name; const state = fixture(options); activeState = state;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await context.route("**/*", (interception) => { if (new URL(interception.request().url()).origin !== origin) { report.blocked_external_count++; return interception.abort(); } return interception.continue(); });
  const page = await context.newPage(); page.setDefaultTimeout(8000); page.on("pageerror", () => { report.page_error_count++; });
  try { checkpoint = "navigate"; await page.goto(origin + "/matcher/app" + route, { waitUntil: "networkidle" }); await run(page, state); }
  catch (error) {
    report.failure_diagnostics = await page.evaluate(() => ({ panel_states: [...document.querySelectorAll("[data-event-access]")].map((node) => node.getAttribute("data-event-access")), input_count: document.querySelectorAll("#webapp-event-invitation").length, input_disabled: document.querySelector("#webapp-event-invitation")?.disabled ?? null, invalid_input: document.querySelector("#webapp-event-invitation")?.getAttribute("aria-invalid") ?? null, button_count: document.querySelectorAll("[data-event-access] button").length, error_count: document.querySelectorAll('[role="alert"]').length })).catch(() => null);
    throw error;
  }
  finally { await context.close(); report.scenarios.push({ name, counts: { ...state.counts }, selection_used_observed_revision: state.selectionUsedObservedRevision }); activeState = null; }
}
async function ready(page) { checkpoint = "wait-ready-panel"; await page.locator('[data-event-access="ready"]').waitFor(); }
async function discoveryRead(page, state) {
  checkpoint = "wait-discovery-request"; const deadline = Date.now() + 8000;
  while (state.counts.discovery === 0 && Date.now() < deadline) await page.waitForTimeout(25);
  assert.ok(state.counts.discovery > 0, "The mounted discovery entry must issue its authorized read.");
}
async function clickJoin(page) { await page.getByLabel("活动邀请码", { exact: true }).fill(invitation); await page.getByRole("button", { name: "确认加入活动", exact: true }).click(); await ready(page); }
async function noAutomaticLoop(page, state) {
  await page.getByText("活动访问资格已变化。请确认后重新读取。", { exact: true }).waitFor();
  await page.waitForLoadState("networkidle"); const before = JSON.stringify(state.counts);
  await page.waitForTimeout(500); assert.ok(JSON.stringify(state.counts) === before, "Denied activity must stay stopped without user action.");
  assert.ok(state.counts.members <= 2 && state.counts.me <= 3, "Authorization refresh must stay bounded.");
  assert.equal(await page.locator("[data-event-access]").count(), 0); record("Unknown403 stops remount/read loops without weakening authorization");
}
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  await scenario("join_then_explicit_selection", {}, async (page, state) => {
    await ready(page); assert.equal(state.counts.join + state.counts.select, 0);
    checkpoint = "fill-invitation"; await page.getByLabel("活动邀请码", { exact: true }).fill(invitation);
    checkpoint = "double-click-join";
    await page.getByRole("button", { name: "确认加入活动", exact: true }).evaluate((button) => { button.click(); button.click(); });
    checkpoint = "wait-join-receipt"; await page.getByText("已加入活动。请在活动列表中明确选择当前活动。", { exact: true }).waitFor(); await ready(page);
    assert.equal(state.counts.join, 1); assert.equal(state.counts.select, 0); assert.equal(state.current, "none");
    assert.equal(await page.getByLabel("活动邀请码", { exact: true }).inputValue(), ""); assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    record("Explicit join is duplicate-locked, clears its input, persists nothing and never selects");
    await page.getByRole("button", { name: "设为当前活动", exact: true }).click(); await page.getByRole("button", { name: "当前活动", exact: true }).waitFor();
    assert.equal(state.counts.select, 1); assert.equal(state.current, "A"); record("Only explicit selection changes the server selection and refreshes the host");
    await page.getByRole("link", { name: "发现伙伴", exact: true }).click(); await page.locator(".recommendation-runtime").waitFor(); await discoveryRead(page, state);
    assert.ok(state.counts.discovery > 0); assert.equal(state.counts.select, 1); record("Selected-event discovery still mounts the real recommendation entry");
  });
  for (const source of ["members", "current"]) await scenario("unknown403_" + source, { members: [eventA], current: source === "current" ? "denied" : "A", denyMembers: source === "members" }, async (page, state) => {
    await noAutomaticLoop(page, state); const before = state.counts.members; state.denyMembers = false; state.current = "A";
    await page.getByRole("button", { name: "重新读取活动", exact: true }).click(); await ready(page);
    assert.ok(state.counts.members > before); assert.equal(state.counts.join + state.counts.select, 0); record("Explicit reload releases the denial latch and revalidates memberships");
  });
  await scenario("precise_revoked_revision", { members: [eventB], current: "revoked" }, async (page, state) => {
    await ready(page); await page.getByText("此前选择的活动已无法访问。请选择列表中仍有资格参加的活动。", { exact: true }).waitFor();
    assert.equal(await page.locator(".recommendation-runtime").count(), 0); assert.equal(state.counts.discovery, 0);
    assert.equal(await page.getByText(eventA.name, { exact: true }).count(), 0); assert.equal(await page.getByRole("button", { name: "当前活动", exact: true }).count(), 0);
    assert.equal(state.counts.select, 0); record("Exact revoked metadata reveals no old event and keeps discovery closed");
    await page.getByRole("button", { name: "设为当前活动", exact: true }).click(); await page.locator(".recommendation-runtime").waitFor(); await discoveryRead(page, state);
    assert.equal(state.selectionUsedObservedRevision, true); assert.equal(state.current, "B"); assert.equal(state.counts.select, 1); assert.equal(state.counts.join, 0); assert.ok(state.counts.discovery > 0);
    record("Explicit legal-Space switch uses the observed revoked revision and refreshes parent context");
  }, "/discover");
  await scenario("old_receipt_new_membership", { oldReceipt: true }, async (page, state) => {
    await ready(page); await clickJoin(page); await page.getByText(/这份旧回执关联的成员资格已失效/).waitFor(); await ready(page);
    assert.equal(await page.getByRole("button", { name: "设为当前活动", exact: true }).count(), 0); assert.equal(state.counts.select, 0);
    state.members = [{ ...eventA, membership_id: 42 }]; await page.getByRole("button", { name: "重新读取活动", exact: true }).click(); await ready(page);
    await page.getByText(/已读取你新加入的成员资格/).waitFor(); assert.equal(await page.getByRole("button", { name: "设为当前活动", exact: true }).isEnabled(), true);
    await page.getByRole("button", { name: "设为当前活动", exact: true }).click(); await page.getByRole("button", { name: "当前活动", exact: true }).waitFor();
    assert.equal(state.counts.select, 1); record("Old failed receipt cannot authorize an old member or block a new legal incarnation");
  });
  await scenario("layout_keyboard_labels", { members: [eventA, eventB] }, async (page, state) => {
    await ready(page);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 }); await page.evaluate(() => document.fonts.ready);
      const metrics = await page.locator("[data-event-access]").evaluate((panel) => {
        const controls = [...panel.querySelectorAll("input,button")], input = panel.querySelector("input");
        const bounds = controls.map((element) => { const rect = element.getBoundingClientRect(); return { height: rect.height, left: rect.left, right: rect.right }; });
        return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, clipped: bounds.filter((rect) => rect.left < -1 || rect.right > innerWidth + 1).length, undersized: bounds.filter((rect) => rect.height < 44).length, inputFontSize: getComputedStyle(input).fontSize, labelled: input.labels?.length === 1 && input.labels[0].htmlFor === input.id, described: Boolean(document.getElementById(input.getAttribute("aria-describedby"))) };
      });
      assert.ok(metrics.scrollWidth <= width + 1, "Activity page must fit the viewport."); assert.equal(metrics.clipped + metrics.undersized, 0); assert.equal(metrics.labelled && metrics.described, true);
      if (width < 600) assert.equal(metrics.inputFontSize, "16px"); assert.equal(await page.getByLabel("活动邀请码", { exact: true }).inputValue(), "");
      report.viewports.push(metrics); const screenshot = "event-access-" + width + ".png"; await page.screenshot({ path: path.join(output, screenshot), fullPage: true }); report.screenshots.push(screenshot);
    }
    record("Activity controls fit 1440/390/320px with 44px targets, 16px mobile input and associated labels");
    await page.reload({ waitUntil: "networkidle" }); await ready(page); await page.keyboard.press("Tab"); assert.equal(await page.evaluate(() => document.activeElement?.textContent), "跳到正文");
    await page.keyboard.press("Enter"); assert.equal(await page.evaluate(() => document.activeElement?.id), "webapp-main");
    const input = page.getByLabel("活动邀请码", { exact: true }); await input.focus(); await page.keyboard.press("Tab"); assert.equal(await page.evaluate(() => document.activeElement?.textContent), "确认加入活动");
    await page.keyboard.press("Enter"); assert.equal(await input.getAttribute("aria-invalid"), "true"); assert.equal(await page.evaluate(() => document.activeElement?.id), "webapp-event-invitation");
    assert.equal(state.counts.join + state.counts.select, 0); record("Keyboard skip, tab, submit and labelled error focus work without accidental writes");
  });
  await scenario("unselected_discovery_gate", { members: [eventA] }, async (page, state) => {
    await ready(page); assert.equal(await page.locator(".recommendation-runtime").count(), 0); assert.equal(state.counts.discovery, 0); assert.equal(state.counts.join + state.counts.select, 0);
    record("Membership alone cannot open discovery before current-event selection");
  }, "/discover");
  await scenario("guest_discovery_gate", { guest: true }, async (page, state) => {
    await page.getByRole("heading", { name: "登录后，继续你的活动", exact: true }).waitFor(); assert.equal(await page.locator(".recommendation-runtime,[data-event-access]").count(), 0);
    assert.equal(state.counts.discovery + state.counts.current + state.counts.members, 0); record("Guest cannot read memberships, resolve an event or mount discovery");
  }, "/discover");
  assert.equal(report.page_error_count + report.blocked_external_count + report.fixture_contract_failures + report.unexpected_route_count, 0);
  assert.ok(report.scenarios.every((item) => item.counts.unexpectedWrites === 0)); record("Only local synthetic traffic, no unexpected writes, external calls or page errors"); report.status = "passed";
} catch (error) {
  // Do not serialize Playwright call logs, invitation values or raw API replies.
  report.status = "failed"; report.failure = { scenario: scenarioId, checkpoint, kind: error instanceof assert.AssertionError ? "assertion" : "browser_or_fixture" }; process.exitCode = 1;
} finally {
  if (browser) await browser.close(); await new Promise((resolve) => server.close(resolve));
  await fs.writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, failure: report.failure, report: path.relative(root, path.join(output, "report.json")) }));
}
