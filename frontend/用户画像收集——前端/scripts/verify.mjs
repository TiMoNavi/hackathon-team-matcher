import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const base = process.env.PREVIEW_URL || "http://127.0.0.1:4199";
const artifacts = path.resolve("artifacts");
await fs.mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
const failedRequests = [];
const report = { verifiedAt: new Date().toISOString(), checks: [], viewports: [], fonts: {}, errors, failedRequests };
page.on("pageerror", error => errors.push(error.message));
page.on("requestfailed", request => failedRequests.push({ url: request.url(), reason: request.failure()?.errorText }));
function passed(name) { report.checks.push(name); }
async function overflow(label) {
  await page.waitForTimeout(250);
  const result = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, outOfBounds: [...document.querySelectorAll('h1,input,textarea,select,[role="tab"],.primary-action')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1); }).map(el => el.tagName + ":" + (el.getAttribute("aria-label") || el.textContent || "").slice(0, 35)) }));
  report.viewports.push({ label, ...result });
  assert.ok(result.scrollWidth <= result.width + 1, label + " horizontal overflow");
  assert.equal(result.outOfBounds.length, 0, label + " clipped critical controls");
}
async function shot(name) {
  await page.locator("#selected-elements").scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(artifacts, name + ".png"), fullPage: true });
}
try {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.title(), "同频 · 认识你的第一步");
  const cdp = await context.newCDPSession(page);
  await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument");
  for (const selector of ["h1", ".brand-word", ".stage-description", "textarea"]) {
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
    report.fonts[selector] = (await cdp.send("CSS.getPlatformFontsForNode", { nodeId })).fonts;
  }
  assert.ok(report.fonts[".brand-word"].some(font => font.isCustomFont && font.familyName.includes("Bricolage")));
  assert.ok(report.fonts.textarea.some(font => font.isCustomFont && font.familyName === "Inter"));
  assert.ok(report.fonts.h1.some(font => font.familyName.includes("PingFang")));
  passed("Actual rendered Bricolage, Inter and Chinese PingFang glyphs");
  for (const [width, height] of [[1440, 1000], [768, 1000], [390, 844], [320, 740]]) {
    await page.setViewportSize({ width, height });
    await overflow("light-" + width);
    await shot("light-" + width);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "一起做 AI 应用", exact: true }).click();
  assert.equal(await page.getByLabel("你最近在做什么？").inputValue(), "一起做 AI 应用");
  await page.getByRole("button", { name: "试试整理成卡片", exact: true }).click();
  await page.getByRole("button", { name: "试试失败状态", exact: true }).click();
  await page.getByRole("heading", { name: "这次整理停住了" }).waitFor();
  await page.getByRole("button", { name: "重新播放", exact: true }).click();
  await page.getByRole("button", { name: "看看示例画像", exact: true }).waitFor();
  await shot("processing-desktop");
  passed("Suggestion fills input; processing failure and retry recover");
  await page.getByRole("button", { name: "看看示例画像", exact: true }).click();
  await page.getByLabel("怎么称呼你").fill("小林");
  await page.getByLabel("一句话介绍").fill("我喜欢做让人愿意用的小工具。");
  await page.getByRole("button", { name: "移除技能 React", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "移除技能 React", exact: true }).count(), 0);
  await page.getByLabel("这条介绍的展示范围").selectOption("private");
  assert.equal(await page.getByLabel("这条介绍的展示范围").inputValue(), "private");
  await shot("profile-desktop");
  passed("Profile nickname, introduction, skills and visibility are editable");
  await page.getByRole("button", { name: "接着聊聊想法", exact: true }).click();
  await page.getByLabel("说说你的想法").fill("我想做一个帮助朋友整理点子的工具");
  await page.getByRole("button", { name: "发送想法", exact: true }).click();
  await page.getByText("你想先从哪一件聊起？", { exact: false }).waitFor();
  assert.equal(await page.getByLabel("说说你的想法").inputValue(), "");
  assert.ok((await page.locator(".user-message").textContent()).includes("帮助朋友整理点子"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(350);
  const answerFits = await page.evaluate(() => { const body = document.querySelector(".ui-ansc__body").getBoundingClientRect(); const content = document.querySelector(".ui-ansc__inner").getBoundingClientRect(); return content.bottom <= body.bottom + 1; });
  assert.ok(answerFits, "Assistant answer is not clipped by its action row");
  await overflow("chat-390"); await shot("chat-mobile");
  await page.getByLabel("说说你的想法").fill("用中文输入法写一句话");
  await page.getByLabel("说说你的想法").dispatchEvent("keydown", { key: "Enter", code: "Enter", isComposing: true, bubbles: true });
  assert.equal(await page.getByLabel("说说你的想法").inputValue(), "用中文输入法写一句话");
  passed("Chat sends and displays a preset response; composition Enter does not send");
  await page.getByRole("button", { name: "切换到夜间模式", exact: true }).click();
  for (const [width, height] of [[1440, 1000], [768, 1000], [390, 844], [320, 740]]) {
    await page.setViewportSize({ width, height }); await overflow("dark-chat-" + width);
    if (width === 1440 || width === 390) await shot("dark-chat-" + width);
  }
  await page.getByRole("tab", { name: "认识你", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 }); await shot("desktop-dark");
  await page.setViewportSize({ width: 390, height: 844 }); await shot("mobile-dark");
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
  assert.equal(await page.getByLabel("你最近在做什么？").inputValue(), "");
  passed("Theme persists; personal input does not persist across reload");
  await page.getByRole("button", { name: "减少动态效果", exact: true }).click();
  assert.equal(await page.locator("canvas").count(), 0);
  assert.equal(await page.locator(".still-orb").count(), 1);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.motion), "reduced");
  await page.getByRole("button", { name: "开启动画", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(100);
  assert.equal(await page.locator("canvas").count(), 0);
  passed("Manual and operating-system reduced motion replace animation with a static orb");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "切换到浅色模式", exact: true }).click();
  const networkWrites = [];
  const observer = req => { if (["POST", "PUT", "PATCH"].includes(req.method())) networkWrites.push(req.url()); };
  page.on("request", observer);
  await page.locator(".upload-disclosure summary").click();
  await page.locator('input[type="file"]').setInputFiles({ name: "demo-notes.txt", mimeType: "text/plain", buffer: Buffer.from("Synthetic preview data only.") });
  await page.waitForTimeout(1500);
  assert.ok((await page.locator(".upload-content").textContent()).includes("demo-notes.txt"));
  assert.equal(networkWrites.length, 0);
  await overflow("upload-390");
  await shot("upload-mobile");
  passed("File selection shows local feedback with no network upload");
  page.off("request", observer);
  await page.getByRole("tab", { name: "整理中", exact: true }).click();
  await page.getByRole("tab", { name: "认识你", exact: true }).click();
  await page.waitForTimeout(3300);
  assert.equal(await page.getByRole("tab", { name: "认识你", exact: true }).getAttribute("aria-selected"), "true");
  passed("Switching preview tabs cancels old timers and preserves the selected context");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.keyboard.press("Tab");
  assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), "BODY");
  passed("Keyboard focus remains on an interactive control");
  const baseline = await context.newPage();
  try { await baseline.goto("http://127.0.0.1:4196/", { waitUntil: "networkidle", timeout: 20000 }); await baseline.evaluate(() => document.fonts.ready); await baseline.waitForTimeout(2000); await baseline.screenshot({ path: path.join(artifacts, "signalry-reference-desktop.png") }); await baseline.setViewportSize({ width: 390, height: 844 }); await baseline.waitForTimeout(300); await baseline.screenshot({ path: path.join(artifacts, "signalry-reference-mobile.png") }); report.baseline = "Original Signalry desktop/mobile screenshots captured without modifying the reference"; }
  catch(error) { report.baseline = String(error); }
  await baseline.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(failedRequests, []);
  report.status = "passed";
} catch (error) {
  report.status = "failed"; report.failure = String(error);
  await page.screenshot({ path: path.join(artifacts, "verification-failure.png"), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(artifacts, "verification.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}
