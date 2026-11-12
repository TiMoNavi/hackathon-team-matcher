import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Load the existing installed test tool only; do not touch its page or sources.
const require = createRequire(new URL("../../用户画像收集——前端/package.json", import.meta.url));
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.MATCHER_WEBAPP_TEST_URL;
assert.ok(base, "Set MATCHER_WEBAPP_TEST_URL to the approved isolated page.");
const address = new URL(base);
assert.ok(["127.0.0.1", "localhost"].includes(address.hostname) && address.port === "8113", "Only the approved isolated port 8113 is allowed.");
assert.equal(address.pathname, "/matcher/app");
const runDirectory = process.env.MATCHER_WEBAPP_RUN === "n04" ? "artifacts/n04/n03-regression" : "artifacts";
const out = fileURLToPath(new URL(`../${runDirectory}/`, import.meta.url));
await fs.mkdir(out, { recursive: true });
const report = { date: new Date().toISOString(), passed: false, checks: [], viewports: [], fonts: {}, pageErrors: [], unexpectedNetwork: [], expectedUnauthorized: 0, screenshots: [] };
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
const record = (value) => report.checks.push(value);

function observe(page) {
  page.on("pageerror", (error) => report.pageErrors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!["data:", "about:"].includes(url.protocol) && url.origin !== address.origin) report.unexpectedNetwork.push({ method: request.method(), path: url.pathname, problem: "cross-origin" });
    if (request.method() !== "GET") report.unexpectedNetwork.push({ method: request.method(), path: url.pathname, problem: "unexpected-write" });
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname === "/api/v1/me" && response.status() === 401) report.expectedUnauthorized++;
    else if (response.status() >= 400) report.unexpectedNetwork.push({ path: url.pathname, status: response.status() });
  });
}
async function signedOut(page) {
  await page.locator('[data-state="signed-out"]').waitFor();
  assert.equal(await page.getByRole("link", { name: "前往登录", exact: true }).getAttribute("href"), "/matcher/app/login");
  assert.equal(await page.locator("#matcher-webapp-root [data-state=ready]").count(), 0);
}
async function viewport(page, width, dark) {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
  if (dark !== await page.locator("html").evaluate((html) => html.classList.contains("dark"))) await page.getByRole("button", { name: dark ? "切换夜间模式" : "切换日间模式" }).click();
  await page.evaluate(() => document.fonts.ready);
  // Let the original Button color transition finish before visual capture.
  await page.waitForTimeout(250);
  const metrics = await page.evaluate(() => {
    const critical = [...document.querySelectorAll("h1, .webapp-tabs a, .webapp-header button, .webapp-actions a, .webapp-actions button")];
    return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, clipped: critical.filter((element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1); }).map((element) => element.textContent.trim()), smallTargets: critical.filter((element) => element.tagName !== "H1" && element.getBoundingClientRect().height < 44).map((element) => element.textContent.trim()), background: getComputedStyle(document.body).backgroundColor };
  });
  assert.ok(metrics.scrollWidth <= width + 1); assert.deepEqual(metrics.clipped, []); assert.deepEqual(metrics.smallTargets, []);
  report.viewports.push({ width, dark, ...metrics });
  const file = `signed-out-${width}-${dark ? "night" : "day"}.png`;
  await page.screenshot({ path: path.join(out, file), fullPage: true }); report.screenshots.push(file);
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light" });
  const page = await context.newPage(); observe(page);
  const response = await page.goto(base, { waitUntil: "networkidle" }); assert.equal(response.status(), 200); await signedOut(page);
  assert.ok(report.expectedUnauthorized >= 1, "A real HTTP401 must drive the login state."); record("Real unauthenticated /me 401 renders login without identity or cards");
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0); record("No identity/activity/CSRF/browser preference persistence");
  const cdp = await context.newCDPSession(page); await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument");
  for (const selector of [".webapp-brand .font-heading > span", ".webapp-footer", "h1"]) {
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
    report.fonts[selector] = (await cdp.send("CSS.getPlatformFontsForNode", { nodeId })).fonts;
  }
  assert.ok(report.fonts[".webapp-brand .font-heading > span"].some((font) => font.isCustomFont && /Bricolage/i.test(font.familyName)));
  assert.ok(report.fonts[".webapp-footer"].some((font) => font.isCustomFont && /Inter/i.test(font.familyName)));
  assert.ok(report.fonts.h1.some((font) => font.glyphCount > 0)); record("Bricolage and Inter render; Chinese platform font captured separately");
  for (const width of [1440, 768, 390, 320]) { await viewport(page, width, false); await viewport(page, width, true); }
  assert.notEqual(report.viewports[0].background, report.viewports[1].background); record("Four viewport widths and day/night have no horizontal clipping or undersized actions");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload({ waitUntil: "networkidle" }); await signedOut(page);
  await page.keyboard.press("Tab"); assert.equal(await page.evaluate(() => document.activeElement?.textContent), "跳到正文");
  await page.keyboard.press("Enter"); assert.equal(await page.evaluate(() => document.activeElement?.id), "webapp-main"); record("Keyboard skip link focuses main content");
  await page.getByRole("link", { name: "账号与活动", exact: true }).click(); await signedOut(page); assert.equal(new URL(page.url()).pathname, "/matcher/app/home");
  await page.reload({ waitUntil: "networkidle" }); await signedOut(page);
  await page.getByRole("link", { name: "活动入口", exact: true }).click(); await signedOut(page);
  await page.goBack(); await signedOut(page); assert.equal(new URL(page.url()).pathname, "/matcher/app/home");
  await page.goForward(); await signedOut(page); assert.equal(new URL(page.url()).pathname, "/matcher/app"); record("Plugin deep link reload, back and forward revalidate authorization");
  const before = report.expectedUnauthorized; await page.getByRole("button", { name: "重新读取", exact: true }).click(); await signedOut(page); assert.ok(report.expectedUnauthorized > before); record("Explicit retry performs another real read");
  await context.close();
  const reducedContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const reducedPage = await reducedContext.newPage(); observe(reducedPage); await reducedPage.goto(base, { waitUntil: "networkidle" }); await signedOut(reducedPage);
  assert.equal(await reducedPage.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true);
  assert.equal(await reducedPage.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running").length), 0); record("Reduced-motion context has no running animation");
  await reducedContext.close();
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.unexpectedNetwork, []); record("All requests same-origin GET; no application exceptions or unexpected HTTP errors");
  report.passed = true;
} catch (error) { report.failure = error.message; throw error; }
finally { await browser.close(); await fs.writeFile(path.join(out, "browser-report.json"), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, real401: report.expectedUnauthorized, report: `${runDirectory}/browser-report.json` })); }
