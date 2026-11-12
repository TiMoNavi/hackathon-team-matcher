import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Fixed isolated target. No seeding, flags, cookie export, login shortcut,
// message send, arbitrary target argument, trace or private response logging.
const base = new URL('http://127.0.0.1:8124/matcher/chat');
const fixtureFile = fileURLToPath(new URL('../../../../backend/.runtime/chat-upgrade/c04-fixture.json', import.meta.url));
const out = fileURLToPath(new URL('../artifacts/read-browser/', import.meta.url));
const require = createRequire(new URL('../../../用户画像收集——前端/package.json', import.meta.url));
const { chromium } = require('playwright');
const report = {
  stage: 'C06-R-isolated-read-browser', passed: false, checks: [], viewports: [], fonts: {}, screenshots: [],
  normalNativeFormLogins: 0, realProviderAuthentication: false, realUserDataUsed: false,
  credentialsReturned: false, cookieExported: false, rawMessageBodiesLogged: false, screenshotsSyntheticOnly: true,
  apiRequests: { list: 0, history: 0, increment: 0, readState: 0 },
  receipt: { observedWrites: 0, alreadyReadNoWrite: 0 }, pageErrors: 0, consoleErrors: 0,
  blockedExternalRequests: 0, blockedUnexpectedWrites: 0, limitations: [],
  focusLifecycle: { status: 'not-run', snapshots: [] },
};
let stage = 'preflight';
let browser;
const contexts = new Set();
const check = (name) => report.checks.push(name);
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const chatPath = (value) => /^\/api\/v1\/conversations(?:\/([1-9][0-9]*)\/(messages|read-state))?$/.exec(value);
const ownedBody = (value) => typeof value === 'string' && /^Synthetic C04 message [1-7]$/.test(value);

async function prepareOutput() {
  const integration = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
  assert.equal(await fs.realpath(integration), integration, 'Output parent must not traverse symlinks.');
  for (const directory of [path.join(integration, 'artifacts'), path.resolve(out)]) {
    let stat;
    try { stat = await fs.lstat(directory); }
    catch (error) { if (error.code !== 'ENOENT') throw error; await fs.mkdir(directory, { mode: 0o700 }); stat = await fs.lstat(directory); }
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'Output must be a real directory.');
    assert.equal(await fs.realpath(directory), directory, 'Output directory must not traverse symlinks.');
  }
}
async function writeArtifact(filename, data) {
  assert.ok(/^(?:read-(?:1440|320)-(?:night|day)-(?:history|list)[.]png|read-browser-report[.]json)$/.test(filename), 'Fixed artifact name required.');
  await prepareOutput();
  const target = path.join(out, filename);
  try { const stat = await fs.lstat(target); assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1, 'Artifact must be an unlinked regular file.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  assert.ok(typeof fsConstants.O_NOFOLLOW === 'number', 'No-follow file writes are required.');
  const handle = await fs.open(target, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | fsConstants.O_NOFOLLOW, 0o600);
  try { assert.ok((await handle.stat()).isFile(), 'Artifact must remain a regular file.'); await handle.writeFile(data); }
  finally { await handle.close(); }
}

async function readOwnedAccounts() {
  assert.equal(process.argv.length, 2, 'No target or output overrides.');
  const stat = await fs.lstat(fixtureFile);
  assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'Private regular fixture required.');
  assert.ok(typeof process.getuid === 'function', 'Local UID ownership checks are required.');
  assert.equal(stat.uid, process.getuid(), 'Fixture must belong to the executing user.');
  assert.equal(stat.mode & 0o777, 0o600, 'Private file permissions required.');
  assert.equal(await fs.realpath(fixtureFile), fixtureFile, 'No fixture symlink traversal.');
  const source = JSON.parse(await fs.readFile(fixtureFile, 'utf8'));
  assert.ok(source?.kind === 'chat-c04-synthetic-v1' && source.actors, 'Synthetic provenance required.');
  const actors = {};
  for (const role of ['a', 'b']) {
    const value = source.actors[role];
    assert.ok(value?.username === 'chat_c04_' + role && typeof value.password === 'string' && /^[a-f0-9]{48}$/.test(value.password), 'Synthetic account shape refused.');
    actors[role] = { username: value.username, password: value.password };
  }
  return actors;
}
async function newContext() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
  contexts.add(context);
  await context.route('**/*', async (route) => {
    const request = route.request(); const url = new URL(request.url());
    if (['data:', 'about:', 'blob:'].includes(url.protocol)) return route.continue();
    if (url.origin !== base.origin) { report.blockedExternalRequests++; return route.abort('blockedbyclient'); }
    if (!['GET', 'HEAD'].includes(request.method())) {
      const login = request.method() === 'POST' && ['/user/auth/login', '/user/auth/password'].includes(url.pathname);
      const receipt = request.method() === 'PUT' && /^\/api\/v1\/conversations\/[1-9][0-9]*\/read-state$/.test(url.pathname);
      if (!login && !receipt) { report.blockedUnexpectedWrites++; return route.abort('blockedbyclient'); }
    }
    return route.continue();
  });
  return context;
}
function observe(page) {
  const observed = { reading: false, actorHeaders: [], list: null, history: null, pending: new Set(), failures: [], receipts: [] };
  page.on('pageerror', () => { if (observed.reading) report.pageErrors++; });
  page.on('console', (message) => { if (observed.reading && message.type() === 'error') report.consoleErrors++; });
  page.on('request', (request) => {
    if (!observed.reading) return;
    const url = new URL(request.url()); const match = chatPath(url.pathname);
    if (!match) { if (url.pathname.startsWith('/api/')) observed.failures.push('unexpected-api'); return; }
    const headers = request.headers(); observed.actorHeaders.push(headers['x-matcher-chat-actor'] ?? null);
    if (!match[1]) report.apiRequests.list++;
    else if (match[2] === 'read-state') {
      report.apiRequests.readState++;
      let payload; try { payload = request.postDataJSON(); } catch { observed.failures.push('invalid-read-body'); return; }
      if (request.method() !== 'PUT' || !headers['x-csrf-token'] || !payload || Object.keys(payload).join(',') !== 'read_seq' || !Number.isSafeInteger(payload.read_seq) || payload.read_seq < 0) observed.failures.push('invalid-read-write');
      else observed.receipts.push({ conversation: Number(match[1]), seq: payload.read_seq });
    } else if (url.searchParams.has('after_seq')) report.apiRequests.increment++; else report.apiRequests.history++;
  });
  page.on('response', (response) => {
    if (!observed.reading) return;
    const url = new URL(response.url()); const match = chatPath(url.pathname); if (!match) return;
    const pending = (async () => {
      if (response.status() !== 200) { observed.failures.push('chat-http-status'); return; }
      const envelope = await response.json();
      if (!envelope?.data || typeof envelope.meta?.request_id !== 'string') { observed.failures.push('invalid-envelope'); return; }
      if (!match[1]) {
        const items = envelope.data.items;
        if (!Array.isArray(items) || items.length !== 2 || items.some((entry) => !positive(entry.id) || entry.type !== 'direct' || !['Synthetic C04 history', 'Synthetic C04 empty'].includes(entry.title) || entry.permissions?.read !== true || entry.permissions?.send !== false || entry.permissions?.invite !== false || entry.permissions?.leave !== false || entry.last_message && !ownedBody(entry.last_message.body))) { observed.failures.push('non-owned-list'); return; }
        observed.list = items.map((entry) => ({ id: entry.id, label: entry.title === 'Synthetic C04 history' ? 'history' : 'empty' }));
      } else if (match[2] === 'messages') {
        const data = envelope.data;
        if (data.context?.type !== 'direct' || Number(match[1]) !== data.context.conversation_id || !Array.isArray(data.items) || data.items.some((entry) => !ownedBody(entry.body) || entry.kind !== 'text' || entry.sender?.status !== 'unavailable' || !Array.isArray(entry.attachments) || entry.attachments.length !== 0)) { observed.failures.push('non-owned-history'); return; }
        observed.history = { conversation: Number(match[1]), count: data.items.length, readSeq: data.read_seq, unreadCount: data.unread_count };
      }
    })().catch(() => observed.failures.push('response-projection-failed'));
    observed.pending.add(pending); void pending.finally(() => observed.pending.delete(pending));
  });
  return observed;
}
async function settled(observed) { await Promise.all([...observed.pending]); assert.equal(observed.failures.length, 0, 'Only valid owned synthetic responses are accepted.'); }
async function nativeLogin(page, account) {
  await page.bringToFront(); await page.goto(base.origin + '/user/auth/login', { waitUntil: 'networkidle' });
  await page.locator('#login_username:not([readonly])').fill(account.username); await page.locator('#continue-button').click();
  await page.locator('#login_password').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#login_username[readonly]').count(), 1, 'Expected native second step.');
  await page.locator('#login_password').fill(account.password); await page.locator('#login-button').click();
  await page.waitForURL((url) => !['/user/auth/login', '/user/auth/password'].includes(url.pathname), { waitUntil: 'domcontentloaded' });
  report.normalNativeFormLogins++;
}
async function openRead(page, observed) {
  observed.reading = true; await page.bringToFront();
  const response = await page.goto(base.href, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200); assert.ok(response.headers()['cache-control']?.includes('no-store')); assert.equal(response.headers()['x-content-type-options'], 'nosniff');
  // Initial HTML is inspected only in memory before the application erases its
  // bootstrap node. Neither HTML, CSRF nor actor ids enter the output report.
  const html = await response.text();
  const match = /<script\b[^>]*\bid=["']matcher-chat-bootstrap["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
  assert.ok(match, 'Server bootstrap required.'); const input = JSON.parse(match[1]);
  assert.deepEqual(Object.keys(input).sort(), ['actor_id', 'api_base', 'base_path', 'csrf_header', 'csrf_token', 'integration_stage', 'native_chat_url', 'native_home_url', 'native_login_url', 'schema_version']);
  assert.equal(input.schema_version, 2); assert.equal(input.integration_stage, 'read'); assert.ok(positive(input.actor_id));
  assert.equal(input.api_base, '/api/v1'); assert.equal(input.base_path, '/matcher/chat'); assert.equal(input.csrf_header, 'X-CSRF-Token'); assert.ok(typeof input.csrf_token === 'string' && input.csrf_token.length > 0);
  assert.ok(['/mail/mail/index', '/index.php?r=mail%2Fmail%2Findex'].includes(input.native_chat_url)); const actor = input.actor_id;
  await page.locator('#matcher-chat-root [data-state="read"]').waitFor({ state: 'visible' }); await page.locator('.chat-list-item[data-conversation-id]').first().waitFor(); await settled(observed);
  assert.ok(observed.actorHeaders.length > 0 && observed.actorHeaders.every((value) => value === String(actor)), 'Actor partition must match native bootstrap.');
  assert.equal(await page.locator('#matcher-chat-bootstrap').textContent(), ''); assert.equal(await page.locator('#matcher-chat-root [data-state="shell"]').count(), 0);
  return actor;
}
async function selectConversation(page, observed, id) {
  const wait = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/conversations/' + id + '/messages' && response.request().method() === 'GET');
  await page.locator('[data-conversation-id="' + id + '"]').click(); await wait;
  await page.locator('#conversation-main[data-chat-open="true"]').waitFor(); await page.waitForFunction(() => document.querySelector('.message-history')?.getAttribute('aria-busy') === 'false'); await settled(observed);
}
async function readOnlyControls(page) {
  assert.equal(await page.locator('#matcher-chat-root textarea:not([disabled])').count(), 0);
  for (const name of ['发送', '添加附件，尚未开放', '新建会话，尚未开放', '群聊，尚未开放']) assert.equal(await page.getByRole('button', { name, exact: true, includeHidden: true }).isDisabled(), true);
}
async function viewport(page, observed, width, dark, view) {
  await page.setViewportSize({ width, height: width < 600 ? 740 : 1000 }); await page.bringToFront(); await page.locator('[data-state="read"]').waitFor({ state: 'visible' });
  if (dark !== await page.locator('html').evaluate((element) => element.classList.contains('dark'))) await page.getByRole('button', { name: dark ? '切换至夜间模式' : '切换至日间模式', exact: true }).click();
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(120);
  const metrics = await page.evaluate(() => {
    const visible = [...document.querySelectorAll('#matcher-chat-root a, #matcher-chat-root button:not([disabled]), #matcher-chat-root h1, #matcher-chat-root h2')].map((element) => ({ element, rect: element.getBoundingClientRect() })).filter(({ rect }) => rect.width > 0 && rect.height > 0);
    return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, background: getComputedStyle(document.body).backgroundColor,
      clippedCount: visible.filter(({ rect }) => rect.left < -1 || rect.right > innerWidth + 1).length,
      smallTargetCount: visible.filter(({ element, rect }) => !/^H[12]$/.test(element.tagName) && rect.height < 40).length,
      dark: document.documentElement.classList.contains('dark') };
  });
  assert.ok(metrics.scrollWidth <= width + 1, 'No horizontal overflow.'); assert.equal(metrics.clippedCount, 0, 'No clipped controls.'); assert.equal(metrics.smallTargetCount, 0, 'Touch targets retained.'); assert.equal(metrics.dark, dark);
  await settled(observed); await readOnlyControls(page); report.viewports.push({ ...metrics, view });
  const file = 'read-' + width + '-' + (dark ? 'night' : 'day') + '-' + view + '.png'; await writeArtifact(file, await page.screenshot({ fullPage: true })); report.screenshots.push(file);
}
async function explicitReceipt(page, observed, id) {
  const before = observed.receipts.length; await page.locator('.messages-scroll [data-slot="scroll-area-viewport"]').evaluate((element) => { element.scrollTop = element.scrollHeight; }); await page.waitForTimeout(150);
  const visibility = await page.evaluate(() => {
    const view = document.querySelector('.messages-scroll [data-slot="scroll-area-viewport"]'); const visual = window.visualViewport;
    const screen = { top: visual?.offsetTop ?? 0, left: visual?.offsetLeft ?? 0, bottom: (visual?.offsetTop ?? 0) + (visual?.height ?? innerHeight), right: (visual?.offsetLeft ?? 0) + (visual?.width ?? innerWidth) };
    const rectangles = [view.getBoundingClientRect(), screen, { top: 0, left: 0, bottom: innerHeight, right: innerWidth }];
    for (let parent = view.parentElement; parent; parent = parent.parentElement) { const style = getComputedStyle(parent); const r = parent.getBoundingClientRect(); const x = /^(hidden|clip|auto|scroll)$/.test(style.overflowX); const y = /^(hidden|clip|auto|scroll)$/.test(style.overflowY); if (x || y) rectangles.push({ left: x ? r.left : screen.left, right: x ? r.right : screen.right, top: y ? r.top : screen.top, bottom: y ? r.bottom : screen.bottom }); }
    const clip = { top: Math.max(...rectangles.map((r) => r.top)), left: Math.max(...rectangles.map((r) => r.left)), bottom: Math.min(...rectangles.map((r) => r.bottom)), right: Math.min(...rectangles.map((r) => r.right)) };
    const seqs = [...document.querySelectorAll('[data-read-seq]')].filter((element) => { const r = element.getBoundingClientRect(); return r.height > 0 && r.width > 0 && r.top >= clip.top && r.bottom <= clip.bottom && r.left >= clip.left && r.right <= clip.right; }).map((element) => Number(element.dataset.readSeq));
    return { visible: document.visibilityState === 'visible', focused: document.hasFocus(), maxVisible: seqs.length ? Math.max(...seqs) : null };
  });
  assert.ok(visibility.visible && visibility.focused && positive(visibility.maxVisible), 'Visible focused marker required.');
  const button = page.getByRole('button', { name: '已看到这里', exact: true });
  if (await button.isDisabled()) { assert.ok(observed.history?.readSeq >= visibility.maxVisible, 'Disabled receipt must already be read.'); assert.equal(observed.receipts.length, before); report.receipt.alreadyReadNoWrite++; return; }
  const wait = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/conversations/' + id + '/read-state' && response.request().method() === 'PUT');
  await button.click(); const response = await wait; assert.equal(response.status(), 200); await settled(observed); assert.equal(observed.receipts.length, before + 1);
  const sent = observed.receipts.at(-1); assert.equal(sent.conversation, id); assert.ok(sent.seq <= visibility.maxVisible && sent.seq > 0, 'No receipt beyond actually visible position.');
  const payload = await response.json(); assert.ok(payload.data?.read_seq >= sent.seq && Number.isSafeInteger(payload.data?.unread_count)); report.receipt.observedWrites++;
}

async function focusSnapshot(page, label) {
  const value = await page.evaluate(() => {
    const root = document.getElementById('matcher-chat-root');
    const state = root?.querySelector('[data-state]')?.getAttribute('data-state');
    const allowed = ['read', 'idle', 'ready', 'suspended', 'signed-out', 'disposed', 'unavailable'];
    const probe = window.__chatReadFocusProbe;
    return { visibility: document.visibilityState, focused: document.hasFocus(), rootHidden: root ? root.hidden : null,
      state: allowed.includes(state) ? state : 'unknown', messageCount: document.querySelectorAll('[data-message-id]').length,
      conversationCount: document.querySelectorAll('[data-conversation-id]').length,
      events: probe ? { blur: probe.blur, focus: probe.focus, hidden: probe.hidden, visible: probe.visible, pagehide: probe.pagehide } : null };
  });
  report.focusLifecycle.snapshots.push({ label, ...value }); return value;
}
async function verifyRealFocus(page, context, observed) {
  stage = 'focus-install-probe'; report.focusLifecycle.status = 'observing';
  await page.evaluate(() => {
    const probe = { blur: 0, focus: 0, hidden: 0, visible: 0, pagehide: 0 }; window.__chatReadFocusProbe = probe;
    window.addEventListener('blur', (event) => { if (event.isTrusted && event.target === window) probe.blur++; });
    window.addEventListener('focus', (event) => { if (event.isTrusted && event.target === window) probe.focus++; });
    window.addEventListener('pagehide', (event) => { if (event.isTrusted) probe.pagehide++; });
    document.addEventListener('visibilitychange', (event) => { if (event.isTrusted) probe[document.hidden ? 'hidden' : 'visible']++; });
  });
  await focusSnapshot(page, 'before-tab-switch');
  stage = 'focus-switch-to-other-tab'; const other = await context.newPage(); await other.goto('about:blank'); await other.bringToFront();
  // A hidden/background document can pause requestAnimationFrame. Numeric
  // polling observes real events/state without injecting blur or visibility.
  await page.waitForFunction(() => !document.hasFocus() || document.hidden || window.__chatReadFocusProbe?.blur > 0 || window.__chatReadFocusProbe?.hidden > 0, null, { polling: 100, timeout: 2000 }).catch(() => {});
  const switched = await focusSnapshot(page, 'after-tab-switch');
  const transitioned = switched.focused === false || switched.visibility !== 'visible' || switched.events?.blur > 0 || switched.events?.hidden > 0;
  if (!transitioned) {
    report.focusLifecycle.status = 'not-exercised-headless-no-transition';
    report.limitations.push('Headless Chromium did not produce a real focus/visibility transition on tab switch; focus cleanup/resume is not certified by this run.');
    await other.close(); await page.bringToFront(); await focusSnapshot(page, 'unchanged-after-no-transition');
    return;
  }
  stage = 'focus-clear-after-real-transition';
  try {
    await page.waitForFunction(() => document.getElementById('matcher-chat-root')?.hidden === true && document.querySelectorAll('[data-message-id], [data-conversation-id]').length === 0, null, { polling: 100, timeout: 5000 });
  } catch { await focusSnapshot(page, 'clear-timeout'); report.focusLifecycle.status = 'failed-to-clear'; throw new Error('Observed focus transition did not clear chat.'); }
  await focusSnapshot(page, 'cleared-in-background');
  stage = 'focus-restore-native-reload';
  const renewed = page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 });
  await page.bringToFront();
  try { await renewed; }
  catch { await focusSnapshot(page, 'reload-timeout'); report.focusLifecycle.status = 'failed-to-reload'; throw new Error('Focus restoration did not reload.'); }
  stage = 'focus-read-after-reload';
  await page.locator('[data-state="read"]').waitFor({ state: 'visible' }); await page.locator('[data-message-id]').first().waitFor();
  await other.close(); await settled(observed); await focusSnapshot(page, 'fresh-read-after-reload'); report.focusLifecycle.status = 'passed';
  check('Trusted browser focus/visibility loss clears private DOM and restoration reloads native session bootstrap');
}

try {
  await prepareOutput(); const accounts = await readOwnedAccounts(); browser = await chromium.launch({ headless: true });
  stage = 'anonymous-shell'; const anonymous = await newContext(); const guest = await anonymous.newPage(); const guestObserved = observe(guest); guestObserved.reading = true;
  await guest.goto(base.href, { waitUntil: 'networkidle' }); await guest.locator('[data-state="shell"]').waitFor(); assert.equal(await guest.locator('[data-state="read"], [data-message-id]').count(), 0); assert.equal(guestObserved.actorHeaders.length, 0);
  await anonymous.close(); contexts.delete(anonymous); check('Anonymous page remains a shell and makes no chat requests');
  const actors = []; const pairs = [];
  for (const role of ['a', 'b']) {
    stage = 'native-login-' + role; const context = await newContext(); const page = await context.newPage(); page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(25000); const observed = observe(page);
    await nativeLogin(page, accounts[role]); const baselineStorage = await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));
    stage = 'connected-page-' + role; const actor = await openRead(page, observed); actors.push(actor); assert.equal(await page.locator('html').evaluate((element) => element.classList.contains('dark')), false);
    const history = observed.list.find((entry) => entry.label === 'history'); const empty = observed.list.find((entry) => entry.label === 'empty'); assert.ok(history && empty && history.id !== empty.id); pairs.push(observed.list.map((entry) => entry.id).sort((a, b) => a - b));
    assert.equal(observed.receipts.length, 0); await selectConversation(page, observed, history.id); assert.equal(await page.locator('[data-message-id]').count(), 7); assert.equal(observed.receipts.length, 0); await readOnlyControls(page);
    const increment = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/conversations/' + history.id + '/messages' && new URL(response.url()).searchParams.has('after_seq'));
    await page.getByRole('button', { name: '检查新消息', exact: true }).click(); await increment; await settled(observed); assert.equal(await page.locator('[data-message-id]').count(), 7); assert.equal(observed.receipts.length, 0);
    check('Native synthetic account ' + role + ' reads list, history and explicit increment without implicit writes');
    stage = 'visible-receipt-' + role; await explicitReceipt(page, observed, history.id);
    if (role === 'a') {
      stage = 'desktop-mobile-layout'; for (const width of [1440, 320]) for (const dark of [false, true]) await viewport(page, observed, width, dark, 'history'); assert.notEqual(report.viewports[0].background, report.viewports[1].background);
      await page.getByRole('button', { name: '返回会话列表', exact: true }).click(); assert.equal(await page.locator('#conversation-main').getAttribute('data-chat-open'), 'false'); await viewport(page, observed, 320, false, 'list');
      await selectConversation(page, observed, empty.id); assert.ok(await page.getByRole('heading', { name: '这段会话还没有消息', exact: true }).isVisible()); assert.equal(await page.locator('[data-message-id]').count(), 0);
      await page.getByRole('button', { name: '返回会话列表', exact: true }).click(); await selectConversation(page, observed, history.id); await page.reload({ waitUntil: 'networkidle' }); await page.locator('[data-state="read"]').waitFor({ state: 'visible' }); await page.locator('[data-message-id]').first().waitFor(); assert.ok(new URL(page.url()).pathname.endsWith('/conversations/' + history.id));
      check('Desktop/320px day/night, mobile navigation, genuine empty conversation and refreshed deep link pass');
      stage = 'fonts-storage'; await page.setViewportSize({ width: 1440, height: 1000 }); await page.evaluate(() => document.fonts.ready);
      const cdp = await context.newCDPSession(page); await cdp.send('DOM.enable'); await cdp.send('CSS.enable'); const { root } = await cdp.send('DOM.getDocument');
      for (const [key, selector] of [['brand', '#matcher-chat-root .font-heading > span'], ['chinese-title', '#chat-read-title'], ['body', '#matcher-chat-root .demo-footnote']]) { const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector }); if (nodeId) report.fonts[key] = (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts.map(({ familyName, isCustomFont, glyphCount }) => ({ familyName, isCustomFont, glyphCount })); }
      assert.ok(Object.values(report.fonts).flat().some((font) => font.isCustomFont && font.familyName.includes('Bricolage'))); assert.ok(await page.evaluate(() => [...document.fonts].some((font) => font.status === 'loaded' && font.family.includes('Inter'))));
      const storage = await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) })); assert.ok(storage.local.filter((key) => !baselineStorage.local.includes(key)).every((key) => key === 'team-matcher-chat-theme')); assert.ok(storage.session.every((key) => baselineStorage.session.includes(key)));
      check('Local fonts and Chinese glyph evidence recorded; chat adds only theme storage');
      await verifyRealFocus(page, context, observed);
    }
    await settled(observed); assert.ok(observed.actorHeaders.every((value) => value === String(actor))); await context.close(); contexts.delete(context);
  }
  assert.ok(actors.length === 2 && actors[0] !== actors[1]); assert.deepEqual(pairs[0], pairs[1]); assert.equal(report.blockedUnexpectedWrites, 0); assert.equal(report.pageErrors, 0); assert.equal(report.consoleErrors, 0); assert.equal(report.blockedExternalRequests, 0);
  if (report.receipt.observedWrites === 0) report.limitations.push('Both fixture views were already read; receipt no-write behavior passed but a fresh PUT was not exercised.');
  report.limitations.push('No provider login, group authorization, sending, attachments or complete native rollback is certified.'); report.passed = true;
} catch {
  // Playwright failures may include form values, DOM text or request details.
  // Never print the error, message, stack, call log, request or response.
  report.failure = { stage, reason: 'Sanitized verification failure; no credentials or response text included.' }; process.exitCode = 1;
} finally {
  for (const context of contexts) { try { await context.close(); } catch { /* No diagnostics containing user data. */ } }
  if (browser) { try { await browser.close(); } catch { /* Sanitized cleanup. */ } }
  try { await writeArtifact('read-browser-report.json', JSON.stringify(report, null, 2)); }
  catch { report.passed = false; report.failure = { stage: 'safe-output', reason: 'Artifact path refused; no diagnostic content included.' }; process.exitCode = 1; }
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, normalNativeFormLogins: report.normalNativeFormLogins, receiptWrites: report.receipt.observedWrites, failedStage: report.failure?.stage ?? null, report: 'integration/artifacts/read-browser/read-browser-report.json' }));
}
