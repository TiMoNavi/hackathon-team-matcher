import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Supported invocation: python3 -B backend/deploy/chat/verify_entry_browser.py.
// This script never opens credential files or controls harness/service switches.
// The parent verifies runtime/database/server/provenance and sends only the
// fixed synthetic accounts and object ids through its anonymous stdin pipe.
const origin = 'http://127.0.0.1:8124';
const integration = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const output = path.join(integration, 'artifacts/entry-browser');
const require = createRequire(new URL('../../../用户画像收集——前端/package.json', import.meta.url));
const report = {
  stage: 'T1-T2-isolated-entry-browser', passed: false, checks: [], redirects: [], viewports: [], screenshots: [],
  normalNativeFormLogins: 0, realProviderAuthentication: false, realUserDataUsed: false,
  credentialsReturned: false, cookieExported: false, rawMessageBodiesLogged: false, screenshotsSyntheticOnly: true,
  apiRequests: { list: 0, history: 0, readState: 0 }, receiptWrites: 0,
  receiptWriteVerification: 'not-exercised-all-put-blocked',
  blockedExternalRequests: 0, blockedUnexpectedWrites: 0, blockedReadStatePuts: 0,
  pageErrors: 0, readConsoleErrors: 0, mixedCoverageDocuments: 0,
  focusLifecycle: { status: 'not-run', snapshots: [] }, limitations: [],
};
let stage = 'preflight';
let browser;
let fixture;
const contexts = new Set();
const check = (value) => report.checks.push(value);
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const ownedBody = (value) => typeof value === 'string' && /^Synthetic C04 message [1-8]$/.test(value);

async function readInput() {
  assert.equal(process.argv.length, 2);
  assert.ok(!process.stdin.isTTY && Number.isInteger(process.ppid));
  let size = 0; const chunks = [];
  for await (const chunk of process.stdin) { size += chunk.length; assert.ok(size <= 8192); chunks.push(chunk); }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  assert.ok(exact(value, ['kind', 'parent_pid', 'actors', 'conversations', 'read_seq']));
  assert.equal(value.kind, 'chat-entry-browser-stdin-v1'); assert.equal(value.parent_pid, process.ppid);
  assert.ok(exact(value.actors, ['a', 'b']) && exact(value.conversations, ['history', 'empty', 'unmanaged']) && exact(value.read_seq, ['a', 'b']));
  for (const role of ['a', 'b']) {
    const account = value.actors[role];
    assert.ok(exact(account, ['username', 'password', 'id']) && account.username === 'chat_c04_' + role
      && typeof account.password === 'string' && /^[a-f0-9]{48}$/.test(account.password) && positive(account.id));
    assert.ok([7, 8].includes(value.read_seq[role]));
  }
  assert.notEqual(value.actors.a.id, value.actors.b.id);
  assert.ok(Object.values(value.conversations).every(positive) && new Set(Object.values(value.conversations)).size === 3);
  return value;
}

async function prepareOutput() {
  assert.equal(await fs.realpath(integration), integration);
  for (const directory of [path.join(integration, 'artifacts'), output]) {
    let info;
    try { info = await fs.lstat(directory); }
    catch (error) { if (error.code !== 'ENOENT') throw error; await fs.mkdir(directory, { mode: 0o700 }); info = await fs.lstat(directory); }
    assert.ok(info.isDirectory() && !info.isSymbolicLink() && info.uid === process.getuid());
    assert.equal(await fs.realpath(directory), directory);
  }
}
async function artifact(name, data) {
  assert.ok(/^(?:entry-(?:1440|320)-(?:day|night)-(?:history|list)|entry-mixed-unavailable)[.]png$/.test(name) || name === 'entry-browser-report.json');
  await prepareOutput();
  const filename = path.join(output, name);
  try { const info = await fs.lstat(filename); assert.ok(info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && info.uid === process.getuid()); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  assert.ok(typeof fsConstants.O_NOFOLLOW === 'number');
  const handle = await fs.open(filename, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_NOFOLLOW, 0o600);
  try { const info = await handle.stat(); assert.ok(info.isFile() && info.nlink === 1 && info.uid === process.getuid()); await handle.truncate(0); await handle.writeFile(data); }
  finally { await handle.close(); }
}

async function newContext() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark', serviceWorkers: 'block' });
  contexts.add(context);
  const gate = { login: true };
  await context.route('**/*', async (route) => {
    const request = route.request(); const url = new URL(request.url());
    if (['data:', 'about:', 'blob:'].includes(url.protocol)) return route.continue();
    if (url.origin !== origin) { report.blockedExternalRequests++; return route.abort('blockedbyclient'); }
    if (!['GET', 'HEAD'].includes(request.method())) {
      const login = gate.login && request.method() === 'POST' && ['/user/auth/login', '/user/auth/password'].includes(url.pathname);
      if (!login) {
        report.blockedUnexpectedWrites++;
        if (request.method() === 'PUT' && url.pathname.endsWith('/read-state')) report.blockedReadStatePuts++;
        return route.abort('blockedbyclient');
      }
    }
    return route.continue();
  });
  return { context, gate };
}

function observe(page) {
  const value = { reading: false, actor: null, pending: new Set(), failures: [], lists: 0, histories: 0 };
  page.on('pageerror', () => { report.pageErrors++; });
  page.on('console', (message) => { if (value.reading && message.type() === 'error') report.readConsoleErrors++; });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) return;
    if (!value.reading) { value.failures.push('unexpected-api-outside-read'); return; }
    const list = url.pathname === '/api/v1/conversations';
    const history = url.pathname === '/api/v1/conversations/' + fixture.conversations.history + '/messages';
    if (url.pathname.endsWith('/read-state')) report.apiRequests.readState++;
    if ((!list && !history) || request.method() !== 'GET') { value.failures.push('unexpected-api'); return; }
    if (request.headers()['x-matcher-chat-actor'] !== String(value.actor)) value.failures.push('actor-mismatch');
    if (list) report.apiRequests.list++; else report.apiRequests.history++;
  });
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith('/api/')) return;
    const pending = (async () => {
      if (!value.reading || response.status() !== 200) { value.failures.push('unexpected-api-response'); return; }
      const envelope = await response.json();
      if (!envelope?.data || typeof envelope.meta?.request_id !== 'string') { value.failures.push('invalid-envelope'); return; }
      const data = envelope.data;
      if (url.pathname === '/api/v1/conversations') {
        if (!Array.isArray(data.items) || data.items.length !== 1 || data.has_more !== false || data.next_cursor !== null) { value.failures.push('list-coverage-mismatch'); return; }
        const item = data.items[0];
        if (item.id !== fixture.conversations.history || item.type !== 'direct' || item.title !== 'Synthetic C04 history'
          || item.permissions?.read !== true || item.permissions?.send !== false || item.permissions?.invite !== false || item.permissions?.leave !== false
          || !item.last_message || !ownedBody(item.last_message.body)) { value.failures.push('non-owned-list'); return; }
        value.lists++;
      } else if (url.pathname === '/api/v1/conversations/' + fixture.conversations.history + '/messages') {
        if (data.context?.conversation_id !== fixture.conversations.history || data.context?.type !== 'direct'
          || !Array.isArray(data.items) || data.items.length !== 8 || data.read_seq !== fixture.read_seq.a
          || data.items.some((item, index) => item.seq !== index + 1 || item.body !== 'Synthetic C04 message ' + (index + 1)
            || item.kind !== 'text' || item.sender?.status !== 'unavailable' || !Array.isArray(item.attachments) || item.attachments.length !== 0)) {
          value.failures.push('non-owned-history'); return;
        }
        value.histories++;
      } else value.failures.push('unknown-api-response');
    })().catch(() => value.failures.push('invalid-api-projection'));
    value.pending.add(pending); void pending.finally(() => value.pending.delete(pending));
  });
  return value;
}
async function settled(observed) {
  await Promise.all([...observed.pending]);
  assert.equal(observed.failures.length, 0);
  assert.equal(report.blockedUnexpectedWrites, 0);
}

async function nativeLogin(page, account, gate) {
  await page.bringToFront();
  const login = await page.goto(origin + '/user/auth/login', { waitUntil: 'networkidle' });
  assert.equal(login.status(), 200);
  await page.locator('#login_username:not([readonly])').fill(account.username);
  await page.locator('#continue-button').click(); await page.locator('#login_password').waitFor({ state: 'visible' });
  assert.equal(new URL(page.url()).pathname, '/user/auth/password');
  assert.equal(await page.locator('#login_username[readonly]').count(), 1);
  await page.locator('#login_password').fill(account.password);
  const accepted = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/user/auth/password');
  await page.locator('#login-button').click(); assert.equal((await accepted).status(), 302);
  await page.waitForURL((url) => !['/user/auth/login', '/user/auth/password'].includes(url.pathname), { waitUntil: 'domcontentloaded' });
  gate.login = false; report.normalNativeFormLogins++;
}

async function redirectReceipt(response, from, to) {
  const chain = [];
  for (let request = response.request(); request; request = request.redirectedFrom()) chain.unshift(request);
  assert.equal(chain.length, 2); assert.equal(chain[0].url(), origin + from); assert.equal(chain[1].url(), origin + to);
  const first = await chain[0].response();
  assert.equal(first.status(), 302); assert.equal(first.headers().location, to);
  assert.ok(first.headers()['cache-control']?.includes('no-store'));
  assert.equal(response.status(), 200); assert.ok(response.headers()['cache-control']?.includes('no-store'));
  assert.equal(response.headers()['x-content-type-options'], 'nosniff');
  report.redirects.push({ from: from.startsWith('/mail/mail/show') ? 'native-show-history' : 'native-index', to: to === '/matcher/chat' ? 'plugin-list' : 'plugin-history', hops: 1, status: 302 });
}

async function bootstrapReceipt(response, actor) {
  // Inspect in memory only: no raw HTML, token, actor or response body in artifacts.
  const html = await response.text();
  const match = /<script\b[^>]*\bid=["']matcher-chat-bootstrap["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
  assert.ok(match);
  const input = JSON.parse(match[1]);
  assert.ok(exact(input, ['schema_version', 'integration_stage', 'base_path', 'api_base', 'native_home_url', 'native_login_url', 'native_chat_url', 'csrf_header', 'csrf_token', 'actor_id']));
  assert.equal(input.schema_version, 2); assert.equal(input.integration_stage, 'read'); assert.equal(input.actor_id, actor);
  assert.equal(input.api_base, '/api/v1'); assert.equal(input.base_path, '/matcher/chat'); assert.equal(input.csrf_header, 'X-CSRF-Token');
  assert.ok(typeof input.csrf_token === 'string' && input.csrf_token.length > 0);
}

async function noNativeFallback(page) {
  const hrefs = await page.locator('#matcher-chat-root a[href]').evaluateAll((elements) => elements.map((element) => element.getAttribute('href')));
  assert.ok(hrefs.length > 0);
  for (const href of hrefs) {
    if (href === '#conversation-main') continue;
    const url = new URL(href, origin);
    assert.equal(url.origin, origin);
    assert.ok(['/dashboard', '/dashboard/dashboard', '/user/auth/login'].includes(url.pathname)
      || url.pathname === '/index.php' && ['dashboard/dashboard', 'user/auth/login'].includes(url.searchParams.get('r')) && [...url.searchParams.keys()].every((key) => key === 'r'));
  }
  assert.equal(await page.getByText('原版入口', { exact: true }).count(), 0);
  assert.equal(await page.getByText('原版聊天入口', { exact: true }).count(), 0);
  assert.equal(await page.locator('#matcher-chat-root textarea:not([disabled])').count(), 0);
  for (const name of ['发送', '添加附件，尚未开放', '新建会话，尚未开放', '群聊，尚未开放']) {
    assert.equal(await page.getByRole('button', { name, exact: true, includeHidden: true }).isDisabled(), true);
  }
}

async function openRedirect(page, observed, from, expected, history) {
  observed.reading = true; observed.actor = fixture.actors.a.id;
  await page.bringToFront();
  const previousLists = observed.lists; const previousHistory = observed.histories;
  const response = await page.goto(origin + from, { waitUntil: 'networkidle' });
  assert.equal(page.url(), origin + expected); await redirectReceipt(response, from, expected);
  await bootstrapReceipt(response, fixture.actors.a.id);
  await page.locator('[data-state="read"]').waitFor({ state: 'visible' });
  await page.locator('[data-conversation-id]').first().waitFor();
  if (history) await page.waitForFunction(() => document.querySelectorAll('[data-message-id]').length === 8);
  await settled(observed); assert.ok(observed.lists > previousLists);
  if (history) assert.ok(observed.histories > previousHistory); else assert.equal(await page.locator('[data-message-id]').count(), 0);
  assert.equal(await page.locator('#matcher-chat-bootstrap').textContent(), '');
  await noNativeFallback(page);
}

async function viewport(page, observed, width, dark, view) {
  await page.setViewportSize({ width, height: width === 320 ? 740 : 1000 }); await page.bringToFront();
  await page.locator('[data-state="read"]').waitFor({ state: 'visible' });
  if (dark !== await page.locator('html').evaluate((element) => element.classList.contains('dark'))) {
    await page.getByRole('button', { name: dark ? '切换至夜间模式' : '切换至日间模式', exact: true }).click();
  }
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(120);
  const metrics = await page.evaluate(() => {
    const elements = [...document.querySelectorAll('#matcher-chat-root a, #matcher-chat-root button:not([disabled]), #matcher-chat-root h1, #matcher-chat-root h2')]
      .map((element) => ({ element, rect: element.getBoundingClientRect() })).filter(({ rect }) => rect.width > 0 && rect.height > 0);
    return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, dark: document.documentElement.classList.contains('dark'),
      clippedCount: elements.filter(({ rect }) => rect.left < -1 || rect.right > innerWidth + 1).length,
      smallTargetCount: elements.filter(({ element, rect }) => !/^H[12]$/.test(element.tagName) && rect.height < 40).length };
  });
  assert.ok(metrics.scrollWidth <= width + 1); assert.equal(metrics.clippedCount, 0); assert.equal(metrics.smallTargetCount, 0); assert.equal(metrics.dark, dark);
  await settled(observed); await noNativeFallback(page);
  assert.equal(await page.locator('[data-conversation-id]').count(), 1);
  assert.equal(await page.locator('[data-message-id]').count(), 8);
  report.viewports.push({ ...metrics, view });
  const name = 'entry-' + width + '-' + (dark ? 'night' : 'day') + '-' + view + '.png';
  await artifact(name, await page.screenshot({ fullPage: true })); report.screenshots.push(name);
}

async function focusSnapshot(page, label) {
  const snapshot = await page.evaluate(() => {
    const root = document.getElementById('matcher-chat-root');
    const state = root?.querySelector('[data-state]')?.getAttribute('data-state');
    const allowed = ['read', 'idle', 'suspended', 'signed-out', 'disposed', 'unavailable'];
    const probe = window.__chatEntryFocusProbe;
    return { visibility: document.visibilityState, focused: document.hasFocus(), rootHidden: root?.hidden ?? null,
      state: allowed.includes(state) ? state : 'unknown', messages: document.querySelectorAll('[data-message-id]').length,
      conversations: document.querySelectorAll('[data-conversation-id]').length,
      events: probe ? { blur: probe.blur, focus: probe.focus, hidden: probe.hidden, visible: probe.visible, pagehide: probe.pagehide } : null };
  });
  report.focusLifecycle.snapshots.push({ label, ...snapshot }); return snapshot;
}

async function realFocus(page, context, observed) {
  stage = 'focus-install';
  await page.evaluate(() => {
    const probe = { blur: 0, focus: 0, hidden: 0, visible: 0, pagehide: 0 }; window.__chatEntryFocusProbe = probe;
    window.addEventListener('blur', (event) => { if (event.isTrusted && event.target === window) probe.blur++; });
    window.addEventListener('focus', (event) => { if (event.isTrusted && event.target === window) probe.focus++; });
    window.addEventListener('pagehide', (event) => { if (event.isTrusted) probe.pagehide++; });
    document.addEventListener('visibilitychange', (event) => { if (event.isTrusted) probe[document.hidden ? 'hidden' : 'visible']++; });
  });
  await focusSnapshot(page, 'before-tab-switch');
  stage = 'focus-switch';
  const other = await context.newPage(); await other.goto('about:blank'); await other.bringToFront();
  await page.waitForFunction(() => !document.hasFocus() || document.hidden || window.__chatEntryFocusProbe?.blur > 0 || window.__chatEntryFocusProbe?.hidden > 0,
    null, { polling: 100, timeout: 2000 }).catch(() => {});
  const changed = await focusSnapshot(page, 'after-tab-switch');
  if (changed.focused !== false && changed.visibility === 'visible' && !changed.events?.blur && !changed.events?.hidden) {
    report.focusLifecycle.status = 'not-exercised-headless-no-transition';
    report.limitations.push('No real focus/visibility transition occurred; cleanup and resume remain unverified.');
    await other.close(); await page.bringToFront(); return;
  }
  stage = 'focus-clear';
  await page.waitForFunction(() => document.getElementById('matcher-chat-root')?.hidden === true
    && document.querySelectorAll('[data-message-id], [data-conversation-id]').length === 0, null, { polling: 100, timeout: 5000 });
  await focusSnapshot(page, 'cleared-after-real-transition');
  stage = 'focus-restore';
  const navigation = page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 });
  await page.bringToFront(); const response = await navigation;
  assert.ok(response && response.status() === 200); await bootstrapReceipt(response, fixture.actors.a.id);
  await page.locator('[data-state="read"]').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelectorAll('[data-message-id]').length === 8);
  await settled(observed); await noNativeFallback(page); await focusSnapshot(page, 'fresh-read-after-reload');
  await other.close(); report.focusLifecycle.status = 'passed-dom-clear-and-reload-only';
  check('Trusted focus loss clears chat DOM and restoration reloads; read receipts were not exercised');
}

async function mixedUnavailable(page, observed) {
  observed.reading = false;
  for (const suffix of ['', '/conversations/' + fixture.conversations.history]) {
    const response = await page.goto(origin + '/matcher/chat' + suffix, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 503); assert.equal(page.url(), origin + '/matcher/chat' + suffix);
    assert.equal(response.request().redirectedFrom(), null);
    assert.ok(response.headers()['cache-control']?.includes('no-store'));
    await page.getByRole('heading', { name: '聊天页面暂不可用', exact: true }).waitFor();
    const text = await page.locator('body').innerText();
    assert.ok(text.includes('尚未被插件覆盖') && text.includes('不会用部分列表替代全部会话'));
    assert.ok(!text.includes('Synthetic C04') && !text.includes('chat_c04_'));
    assert.equal(await page.locator('#matcher-chat-bootstrap, #matcher-chat-root, [data-message-id], [data-conversation-id]').count(), 0);
    const hrefs = await page.locator('a[href]').evaluateAll((elements) => elements.map((element) => element.getAttribute('href')));
    assert.equal(hrefs.length, 2);
    for (const href of hrefs) { const url = new URL(href, origin); assert.equal(url.origin, origin); assert.ok(['/dashboard', '/dashboard/dashboard', '/user/auth/login'].includes(url.pathname)); }
    await settled(observed); report.mixedCoverageDocuments++;
  }
  await page.setViewportSize({ width: 320, height: 740 });
  const name = 'entry-mixed-unavailable.png'; await artifact(name, await page.screenshot({ fullPage: true })); report.screenshots.push(name);
}

try {
  fixture = await readInput(); await prepareOutput();
  const { chromium } = require('playwright'); browser = await chromium.launch({ headless: true });
  stage = 'native-login-a';
  const a = await newContext(); const page = await a.context.newPage(); const observed = observe(page);
  page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(25000);
  await nativeLogin(page, fixture.actors.a, a.gate);
  stage = 'native-index';
  await openRedirect(page, observed, '/mail/mail/index', '/matcher/chat', false);
  check('Native index redirects once to a fully covered read-only plugin list');
  stage = 'native-history';
  const historyPath = '/matcher/chat/conversations/' + fixture.conversations.history;
  await openRedirect(page, observed, '/mail/mail/show?id=' + fixture.conversations.history, historyPath, true);
  check('Native show redirects once to freshly authorized plugin history; the parent separately checks native seen timestamps');
  stage = 'viewport-layout';
  for (const width of [1440, 320]) for (const dark of [false, true]) await viewport(page, observed, width, dark, 'history');
  await page.getByRole('button', { name: '返回会话列表', exact: true }).click();
  assert.equal(await page.locator('#conversation-main').getAttribute('data-chat-open'), 'false');
  await page.locator('[data-conversation-id]').first().click();
  await page.waitForFunction(() => document.querySelectorAll('[data-message-id]').length === 8); await settled(observed);
  check('1440px and 320px day/night retain layout, disabled writes, safe exit links and mobile back navigation');
  stage = 'deep-link-reload';
  await page.reload({ waitUntil: 'networkidle' }); await page.locator('[data-state="read"]').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelectorAll('[data-message-id]').length === 8);
  assert.equal(page.url(), origin + historyPath); await settled(observed); await noNativeFallback(page);
  check('Refreshed canonical deep link reauthorizes eight synthetic messages without a native fallback');
  await realFocus(page, a.context, observed);
  await settled(observed); await a.context.close(); contexts.delete(a.context);
  stage = 'native-login-b';
  const b = await newContext(); const mixed = await b.context.newPage(); const mixedObserved = observe(mixed);
  mixed.setDefaultTimeout(15000); mixed.setDefaultNavigationTimeout(25000);
  await nativeLogin(mixed, fixture.actors.b, b.gate);
  stage = 'mixed-coverage'; await mixedUnavailable(mixed, mixedObserved);
  check('Normally authenticated mixed-coverage account receives explicit 503 on list and deep link with no partial list or chat API call');
  await b.context.close(); contexts.delete(b.context);
  assert.equal(report.normalNativeFormLogins, 2); assert.equal(report.apiRequests.readState, 0);
  assert.equal(report.pageErrors, 0); assert.equal(report.readConsoleErrors, 0);
  assert.equal(report.blockedExternalRequests, 0); assert.equal(report.blockedUnexpectedWrites, 0);
  report.limitations.push('All PUT requests are blocked and no read receipt is clicked; real read-state updates and focus/read transitions are not certified.');
  report.limitations.push('No provider login, sending, attachments, group authorization, complete native rollback or production deployment is certified.');
  report.passed = true;
} catch {
  report.failure = { stage, reason: 'Sanitized verification failure; no credentials, form values, HTML or response text included.' };
  process.exitCode = 1;
} finally {
  for (const context of contexts) { try { await context.close(); } catch { /* Suppress private diagnostics. */ } }
  if (browser) { try { await browser.close(); } catch { /* Suppress private diagnostics. */ } }
  try { await artifact('entry-browser-report.json', JSON.stringify(report, null, 2)); }
  catch { report.passed = false; report.failure = { stage: 'safe-output', reason: 'Fixed output refused; private diagnostics suppressed.' }; process.exitCode = 1; }
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, normalNativeFormLogins: report.normalNativeFormLogins,
    receiptWrites: report.receiptWrites, failedStage: report.failure?.stage ?? null,
    report: 'integration/artifacts/entry-browser/entry-browser-report.json' }));
}
