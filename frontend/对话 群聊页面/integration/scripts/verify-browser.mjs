import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Read the existing installed browser test dependency; never load app .env files.
const require = createRequire(new URL('../../../用户画像收集——前端/package.json', import.meta.url));
const { chromium } = require('playwright');
const base = new URL('http://127.0.0.1:8124/matcher/chat');
const out = fileURLToPath(new URL('../artifacts/', import.meta.url));
await fs.mkdir(out, { recursive: true });
const report = { stage: 'C03-shell-only', passed: false, checks: [], viewports: [], fonts: {}, pageErrors: [], consoleErrors: [], unexpectedNetwork: [], businessRequests: 0, screenshots: [] };
const browser = await chromium.launch({ headless: true });
const check = (value) => report.checks.push(value);

function observe(page) {
  page.on('pageerror', (error) => report.pageErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (['data:', 'about:', 'blob:'].includes(url.protocol)) return;
    if (url.origin !== base.origin || request.method() !== 'GET') report.unexpectedNetwork.push({ path: url.pathname, method: request.method(), reason: 'origin-or-method' });
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/mail/') || url.pathname.includes('/rest/')) report.businessRequests++;
  });
  page.on('response', (response) => {
    if (response.status() >= 400) report.unexpectedNetwork.push({ path: new URL(response.url()).pathname, status: response.status() });
  });
}

async function shell(page) {
  await page.locator('#matcher-chat-root [data-state=shell]').waitFor();
  assert.equal(await page.locator('#matcher-chat-root [data-state=ready]').count(), 0);
  const text = await page.locator('#matcher-chat-root').innerText();
  for (const fixture of ['林小满', '陈序', '周末造物小队', '城市声音花园']) assert.ok(!text.includes(fixture));
  assert.ok(!text.includes('暂无会话') && !text.includes('你没有消息'), 'Shell must not claim a fetched empty inbox');
  assert.equal(await page.locator('#matcher-chat-root input:not([disabled]), #matcher-chat-root textarea:not([disabled])').count(), 0);
}

async function viewport(page, width, dark) {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
  if (dark !== await page.locator('html').evaluate((e) => e.classList.contains('dark'))) {
    await page.getByRole('button', { name: dark ? '切换至夜间模式' : '切换至日间模式', exact: true }).click();
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  const metrics = await page.evaluate(() => {
    const critical = [...document.querySelectorAll('#matcher-chat-root h1, #matcher-chat-root a, #matcher-chat-root button:not([disabled])')];
    return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, background: getComputedStyle(document.body).backgroundColor, clipped: critical.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1); }).map((e) => e.getAttribute('aria-label') || e.textContent.trim()), smallTargets: critical.filter((e) => { const r = e.getBoundingClientRect(); return e.tagName !== 'H1' && r.width > 0 && r.height > 0 && r.height < 40; }).map((e) => e.getAttribute('aria-label') || e.textContent.trim()) };
  });
  assert.ok(metrics.scrollWidth <= width + 1, 'No horizontal overflow');
  assert.deepEqual(metrics.clipped, []);
  assert.deepEqual(metrics.smallTargets, []);
  report.viewports.push({ dark, ...metrics });
  if ((width === 1440 && !dark) || (width === 390 && dark)) {
    const file = 'shell-' + width + '-' + (dark ? 'night' : 'day') + '.png';
    await page.screenshot({ path: path.join(out, file), fullPage: true });
    report.screenshots.push(file);
  }
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
  const page = await context.newPage(); observe(page);
  const response = await page.goto(base.href, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200);
  assert.equal(response.headers()['x-content-type-options'], 'nosniff');
  assert.ok(response.headers()['cache-control'].includes('no-store'));
  await shell(page);
  assert.equal(await page.locator('html').evaluate((e) => e.classList.contains('dark')), false, 'First visit defaults to day even when OS is dark');
  const bootstrap = await page.locator('#matcher-chat-bootstrap').evaluate((e) => { const b = JSON.parse(e.textContent); return { keys: Object.keys(b).sort(), stage: b.integration_stage, tokenPresent: typeof b.csrf_token === 'string' && b.csrf_token.length > 0 }; });
  assert.deepEqual(bootstrap.keys, ['api_base', 'base_path', 'csrf_header', 'csrf_token', 'integration_stage', 'native_home_url', 'native_login_url', 'schema_version']);
  assert.equal(bootstrap.stage, 'shell'); assert.equal(bootstrap.tokenPresent, true);
  check('Real isolated shell has eight-field bootstrap and no private chat data');
  for (const width of [1440, 768, 390, 320]) { await viewport(page, width, false); await viewport(page, width, true); }
  assert.notEqual(report.viewports[0].background, report.viewports[1].background);
  check('Four viewport widths, day/night and controls have no overflow');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '查看接入说明', exact: true }).click();
  assert.equal(await page.locator('#conversation-main').getAttribute('data-chat-open'), 'true');
  assert.equal(await page.locator('#chat-shell-title').isVisible(), true);
  await page.screenshot({ path: path.join(out, 'shell-390-night-details.png'), fullPage: true });
  report.screenshots.push('shell-390-night-details.png');
  await page.getByRole('button', { name: '返回会话区域', exact: true }).click();
  assert.equal(await page.locator('#conversation-main').getAttribute('data-chat-open'), 'false');
  check('Mobile list/details and return preserve the honest shell state');
  await page.reload({ waitUntil: 'networkidle' }); await shell(page);
  assert.equal(await page.locator('html').evaluate((e) => e.classList.contains('dark')), true);
  const storage = await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));
  assert.ok(storage.local.every((key) => key.toLowerCase().includes('theme')));
  assert.deepEqual(storage.session, []);
  check('Only theme preference persists; no identity, activity, message or CSRF browser storage');
  await page.goto(base.origin + '/matcher/chat/conversations/1', { waitUntil: 'networkidle' }); await shell(page);
  await page.reload({ waitUntil: 'networkidle' }); await shell(page);
  await page.goBack({ waitUntil: 'networkidle' }); await shell(page);
  await page.goForward({ waitUntil: 'networkidle' }); await shell(page);
  check('Conversation-position deep link, reload and history remain data-free shells');
  const focusPage = await context.newPage(); observe(focusPage); await focusPage.goto(base.href, { waitUntil: 'networkidle' }); await shell(focusPage);
  await focusPage.keyboard.press('Tab');
  assert.ok((await focusPage.evaluate(() => document.activeElement?.textContent || '')).includes('跳'));
  await focusPage.keyboard.press('Enter');
  assert.equal(await focusPage.evaluate(() => document.activeElement?.tagName), 'MAIN');
  check('Keyboard skip link focuses main content');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => document.fonts.ready);
  const cdp = await context.newCDPSession(page); await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument');
  for (const selector of ['#matcher-chat-root .font-heading > span', '#chat-shell-title', '#matcher-chat-root .demo-footnote']) {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    if (nodeId) report.fonts[selector] = (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts;
  }
  assert.ok(Object.values(report.fonts).flat().some((font) => font.isCustomFont && font.familyName.includes('Bricolage')));
  assert.ok(await page.evaluate(() => [...document.fonts].some((font) => font.status === 'loaded' && font.family.includes('Inter'))));
  check('Custom Bricolage renders and local Inter loads; Chinese glyph evidence recorded separately');
  await context.close();
  const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const reducedPage = await reduced.newPage(); observe(reducedPage); await reducedPage.goto(base.href, { waitUntil: 'networkidle' }); await shell(reducedPage);
  assert.equal(await reducedPage.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length), 0);
  await reduced.close(); check('Reduced motion leaves no running animations');
  const nojs = await browser.newContext({ javaScriptEnabled: false });
  const nojsPage = await nojs.newPage(); observe(nojsPage); await nojsPage.goto(base.href, { waitUntil: 'networkidle' });
  assert.ok((await nojsPage.locator('noscript').innerText()).length > 0);
  await nojs.close(); check('No-JavaScript fallback is visible');
  assert.equal(report.businessRequests, 0); assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.consoleErrors, []); assert.deepEqual(report.unexpectedNetwork, []);
  check('Zero business API calls, writes, cross-origin requests or page errors');
  report.passed = true;
} catch (error) { report.failure = error.message; throw error; }
finally {
  await browser.close();
  await fs.writeFile(path.join(out, 'browser-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, businessRequests: report.businessRequests, report: 'integration/artifacts/browser-report.json' }));
}
