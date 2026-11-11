import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4203/';
const directory = resolve('docs/screenshots/final');
mkdirSync(directory, { recursive: true });
const report = { date: '2026-11-12', checks: [], errors: [], fonts: {}, layouts: [], animation: [] };
function check(name, passed, detail) { report.checks.push({ name, passed, ...(detail ? { detail } : {}) }); if (!passed) console.log('FAIL', name, detail || ''); }
async function ready(page) {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('.person-avatar img').waitFor({ state: 'visible' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(100);
}
function watch(page) {
  page.on('pageerror', (error) => report.errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') report.errors.push(message.text()); });
}
async function measure(page) {
  return page.evaluate(() => {
    const rect = (s) => document.querySelector(s)?.getBoundingClientRect().toJSON();
    return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, stage: rect('.discovery-stage'), card: rect('.person-card'), controls: rect('.browse-controls'), composer: rect('.composer-dock'), panel: rect('.assistant-panel'), branches: [...document.querySelectorAll('.branch')].map((b) => { const r = b.getBoundingClientRect(), t = b.querySelector('.branch-copy').getBoundingClientRect(); return { text: b.innerText, textFits: t.top >= r.top - 1 && t.bottom <= r.bottom + 1 && t.right <= r.right + 1, textScroll: b.querySelector('strong').scrollWidth, textWidth: b.querySelector('strong').clientWidth }; }) };
  });
}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  watch(page); await ready(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument');
  for (const [name, selector] of [['chinese', 'h1'], ['display', '.english-name'], ['body', '.person-tags > span']]) {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId }); report.fonts[name] = fonts;
  }
  check('English display actually renders Bricolage Grotesque', report.fonts.display.some((f) => /Bricolage/i.test(f.familyName) && f.glyphCount > 0));
  check('English body actually renders Inter', report.fonts.body.some((f) => /Inter/i.test(f.familyName) && f.glyphCount > 0));
  check('Chinese actually renders a system Chinese font', report.fonts.chinese.some((f) => /PingFang|Microsoft YaHei|Noto Sans CJK/i.test(f.familyName) && f.glyphCount > 0));
  for (const [width, height] of [[1920,1080],[1440,900],[1366,768],[1280,720],[1100,900],[1024,768],[768,1024],[390,844],[320,740]]) {
    await page.setViewportSize({ width, height }); await page.waitForTimeout(100);
    const m = await measure(page); report.layouts.push(m);
    check('No horizontal overflow ' + width, m.scrollWidth === width, { actual: m.scrollWidth });
    check('Navigation stays on one line ' + width, await page.locator('.main-nav > *').evaluateAll((elements) => elements.every((el) => [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim()).every((n) => { const range = document.createRange(); range.selectNodeContents(n); return range.getBoundingClientRect().height <= 22; }))));
    check('Branch copy fits ' + width, m.branches.every((b) => b.textFits && b.textScroll <= b.textWidth + 1), m.branches.filter((b) => !b.textFits || b.textScroll > b.textWidth + 1));
    if (width >= 1024) check('Composer clears browsing controls ' + width + 'x' + height, m.controls.bottom + 4 <= m.composer.top, { controls: m.controls.bottom, composer: m.composer.top });
    if ([1440,1366,1280,390,320].includes(width)) await page.screenshot({ path: directory + '/desktop-or-mobile-' + width + '.png', fullPage: true });
    if (width >= 1100) {
      await page.getByRole('button', { name: '展开 AI 助手', exact: true }).click();
      await page.locator('.assistant-panel').waitFor(); await page.waitForTimeout(100);
      const opened = await measure(page); report.layouts.push({ state: 'assistant-open', ...opened });
      check('Sidebar has separate room ' + width, opened.stage.right + 8 <= opened.panel.left && opened.composer.right + 8 <= opened.panel.left, { stage: opened.stage, composer: opened.composer, panel: opened.panel });
      check('Sidebar preserves branch text ' + width, opened.branches.every((b) => b.textFits && b.textScroll <= b.textWidth + 1), opened.branches);
      check('Sidebar preserves controls above input ' + width, opened.controls.bottom + 4 <= opened.composer.top, { controls: opened.controls.bottom, composer: opened.composer.top });
      if (width === 1440 || width === 1280) await page.screenshot({ path: directory + '/sidebar-' + width + '.png', fullPage: true });
      await page.getByRole('button', { name: '关闭 AI 助手' }).click();
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const name of ['林小满','许知夏','唐可']) {
    await page.getByRole('button', { name: '查看' + name, exact: true }).click();
    await page.waitForFunction((name) => document.querySelector('.person-name-line h2').textContent === name, name);
    for (const [i, title] of ['能力与互补','兴趣与想法','时间与节奏'].entries()) {
      await page.getByRole('button', { name: title, exact: true }).click();
      await page.waitForFunction((i) => document.querySelector('.growth-bed').dataset.chapter === String(i), i);
      await page.waitForTimeout(80); const m = await measure(page);
      check(name + ' ' + title + ' has four readable branches', m.branches.length === 4 && m.branches.every((b) => b.textFits));
    }
  }
  await page.getByRole('button', { name: '查看林小满', exact: true }).click();
  await page.getByRole('button', { name: '能力与互补', exact: true }).click(); await page.waitForTimeout(100);
  await page.getByRole('button', { name: '收藏这个人', exact: true }).click();
  check('Saving changes only local state', await page.getByRole('button', { name: '取消收藏', exact: true }).getAttribute('aria-pressed') === 'true');
  await page.getByRole('button', { name: '查看许知夏', exact: true }).click();
  await page.getByRole('button', { name: '查看林小满', exact: true }).click(); await page.waitForTimeout(100);
  check('Saved person stays saved when browsing', await page.getByRole('button', { name: '取消收藏', exact: true }).count() === 1);
  const firstBranch = page.locator('.branch').first(); await firstBranch.click();
  check('Evidence opens with its source', await page.locator('.detail-dialog .source-line').innerText() === '本人确认的贡献方向 · 演示');
  await page.keyboard.press('Escape');
  await page.locator('.detail-dialog').waitFor({ state: 'detached' });
  await page.waitForTimeout(30);
  check('Evidence Escape restores branch focus', await firstBranch.evaluate((el) => el === document.activeElement));
  await page.getByRole('button', { name: '认识完整的 TA', exact: true }).click();
  check('Full profile includes three perspectives', await page.locator('.profile-detail section').count() === 3); await page.keyboard.press('Escape');
  await page.getByLabel('告诉 AI 你想找怎样的队友', { exact: true }).fill('找一位愿意一起做原型的设计伙伴');
  await page.getByRole('button', { name: '发送演示需求', exact: true }).click();
  check('Composer submits to the reserved sidebar', await page.locator('.assistant-panel').isVisible() && await page.locator('.chat-message').count() === 2);
  await page.getByRole('button', { name: '看看知夏', exact: true }).click(); await page.waitForTimeout(100);
  check('Assistant action updates the main stage', await page.locator('.person-name-line h2').innerText() === '许知夏');
  check('Changing people retains conversation', await page.locator('.chat-message').count() === 2);
  await page.getByRole('button', { name: '展开协作节奏', exact: true }).click();
  check('Assistant can change perspective', await page.locator('.growth-bed').getAttribute('data-chapter') === '2');
  await page.getByRole('button', { name: '关闭 AI 助手' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '展开 AI 助手', exact: true }).click();
  check('Mobile sidebar is a modal', await page.locator('.assistant-panel').getAttribute('aria-modal') === 'true');
  check('Mobile modal focuses its own input', await page.locator('#panel-prompt').evaluate((el) => el === document.activeElement));
  await page.locator('.notice-toast').waitFor({ state: 'hidden' });
  await page.screenshot({ path: directory + '/mobile-assistant.png' });
  await page.keyboard.press('Escape');
  check('Mobile Escape closes sidebar', await page.locator('.assistant-panel').count() === 0);
  check('Mobile closing returns focus to launcher', await page.getByRole('button', { name: '展开 AI 助手', exact: true }).evaluate((el) => el === document.activeElement));
  await page.setViewportSize({ width: 1440, height: 900 }); await ready(page);
  check('Reduced motion prevents automatic cycling', await page.locator('.growth-bed').getAttribute('data-playing') === 'false');
  check('Reduced motion has a disabled autoplay control', await page.getByRole('button', { name: '开启自动展开' }).isDisabled());
  check('Refresh resets local save state', await page.getByRole('button', { name: '收藏这个人', exact: true }).count() === 1);
  const animated = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' }); watch(animated); await ready(animated);
  await animated.getByRole('button', { name: '重新生长', exact: true }).click();
  const started = Date.now();
  for (const at of [100,450,950,1800]) {
    const delay = at - (Date.now() - started); if (delay > 0) await animated.waitForTimeout(delay);
    const state = await animated.locator('.branch-fill').evaluateAll((els) => els.map((el) => ({ scale: new DOMMatrixReadOnly(getComputedStyle(el).transform).a, rect: el.getBoundingClientRect().width })));
    report.animation.push({ at, state }); await animated.screenshot({ path: directory + '/growth-' + at + 'ms.png' });
  }
  check('Branches grow toward a stable final width', report.animation[0].state[0].scale < .99 && report.animation.at(-1).state.every((b) => Math.abs(b.scale - 1) < .001), report.animation);
  await animated.waitForTimeout(1800);
  check('Settled branches do not keep moving', await animated.locator('.branch-fill').evaluateAll((els) => els.every((el) => Math.abs(new DOMMatrixReadOnly(getComputedStyle(el).transform).a - 1) < .001)));
  await animated.getByRole('button', { name: '开启自动展开', exact: true }).click(); await animated.mouse.move(0,0);
  await animated.waitForTimeout(9500);
  check('Autoplay changes perspective without changing person', await animated.locator('.growth-bed').getAttribute('data-chapter') === '1' && await animated.locator('.growth-bed').getAttribute('data-person') === 'xiaoman');
  await animated.locator('.branch').first().hover(); const stoppedAt = await animated.locator('.growth-bed').getAttribute('data-chapter');
  await animated.waitForTimeout(9500);
  check('Hover freezes the reading perspective', await animated.locator('.growth-bed').getAttribute('data-chapter') === stoppedAt && await animated.locator('.growth-bed').getAttribute('data-playing') === 'false');
  await animated.getByRole('button', { name: '时间与节奏', exact: true }).click(); await animated.mouse.move(0,0);
  check('Manual perspective selection stops autoplay', await animated.getByRole('button', { name: '开启自动展开', exact: true }).count() === 1);
  await animated.getByRole('button', { name: '展开 AI 助手', exact: true }).click();
  await animated.waitForTimeout(750); const animatedLayout = await measure(animated);
  check('Animated sidebar settles with no overlap', animatedLayout.stage.right + 8 <= animatedLayout.panel.left);
  await animated.screenshot({ path: directory + '/desktop-sidebar-motion.png', fullPage: true });
  const sourceRoot = resolve('../首页/components/ui');
  check('Six shared UI primitives remain unchanged', ['avatar','badge','button','card','dialog','input'].every((name) => readFileSync('components/ui/' + name + '.tsx').equals(readFileSync(sourceRoot + '/' + name + '.tsx'))));
  check('No browser runtime or hydration errors', report.errors.length === 0, report.errors);
} catch (error) { report.errors.push(error.stack); check('Verification completes', false, error.message); } finally {
  await browser.close();
  report.summary = { passed: report.checks.filter((c) => c.passed).length, failed: report.checks.filter((c) => !c.passed).length, errors: report.errors.length };
  writeFileSync('docs/verification.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report.summary));
  if (report.summary.failed || report.summary.errors) process.exitCode = 1;
}
