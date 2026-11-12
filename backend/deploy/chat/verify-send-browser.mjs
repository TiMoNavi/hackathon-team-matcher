import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Execute only through the root-owned Python wrapper. It verifies fixed runtime,
// database, server and fixture provenance before supplying this anonymous stdin.
// No credential files, trace, login screenshots, arbitrary URLs or service work.
const origin = 'http://127.0.0.1:8124';
const integration = path.resolve(fileURLToPath(new URL('../../../frontend/对话 群聊页面/integration/', import.meta.url)));
const output = path.join(integration, 'artifacts/send-browser');
const require = createRequire(new URL('../../../frontend/用户画像收集——前端/package.json', import.meta.url));
const texts = Object.freeze({ a: 'Synthetic C05 browser A', b: 'Synthetic C05 browser B', uncertain: 'Synthetic C05 browser uncertain' });
const initialBodies = new Set(['Synthetic C05 HTTP <script>alert("literal")</script> & 中文🙂\n  preserved  ',
  'Synthetic C05 HTTP reply B', 'Synthetic C05 overlap original', '界'.repeat(4000), 'Synthetic C05 HTTP uncertain delivery', ...Object.values(texts)]);
const report = { stage: 'C06-T-isolated-send-browser', passed: false, checks: [], screenshots: [], viewports: [],
  normalNativeFormLogins: 0, newMessages: 0, sendPosts: 0, receiptWrites: 0,
  browserUsesRealHttp: true, realProviderAuthentication: false, realUserDataUsed: false,
  credentialsReturned: false, cookieExported: false, rawMessageBodiesLogged: false, screenshotsSyntheticOnly: true,
  apiRequests: { list: 0, history: 0, increment: 0 },
  responseLoss: { committedBeforeAbort: false, sameKeyBodyReplay: false, samePersistentMessage: false },
  ime: { kind: 'simulated-browser-composition-events', status: 'not-run', realInputMethodCertified: false },
  duplicateClick: { kind: 'browser-double-click', onePost: false },
  focusLifecycle: { status: 'not-verified' }, explicitReadReceipt: { status: 'not-exercised' },
  blockedExternalRequests: 0, blockedUnexpectedRequests: 0, pageErrors: 0, consoleErrors: 0, expectedLossConsoleErrors: 0,
  limitations: [] };
let stage = 'preflight'; let fixture; let browser; let lostReceipt = null;
const contexts = new Set(); const newReceipts = new Map(); const sentRequests = [];
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const uuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const messagesPath = () => '/api/v1/conversations/' + fixture.conversation_id + '/messages';
const readPath = () => '/api/v1/conversations/' + fixture.conversation_id + '/read-state';
const check = (text) => report.checks.push(text);

async function readInput() {
  assert.equal(process.argv.length, 2); assert.ok(!process.stdin.isTTY && Number.isInteger(process.ppid) && process.ppid > 0);
  let size = 0; const chunks = [];
  for await (const chunk of process.stdin) { size += chunk.length; assert.ok(size <= 8192); chunks.push(chunk); }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  assert.ok(exact(value, ['kind', 'parent_pid', 'actors', 'conversation_id', 'initial_message_count', 'last_seq']));
  assert.equal(value.kind, 'chat-c05-browser-stdin-v1'); assert.equal(value.parent_pid, process.ppid);
  assert.ok(exact(value.actors, ['a', 'b']) && positive(value.conversation_id));
  assert.ok(Number.isSafeInteger(value.initial_message_count) && value.initial_message_count >= 0 && value.initial_message_count <= 20);
  assert.equal(value.last_seq, value.initial_message_count);
  for (const role of ['a', 'b']) {
    const actor = value.actors[role];
    assert.ok(exact(actor, ['id', 'username', 'password']) && positive(actor.id) && actor.username === 'chat_c05_' + role
      && typeof actor.password === 'string' && /^[a-f0-9]{48}$/.test(actor.password));
  }
  assert.notEqual(value.actors.a.id, value.actors.b.id); return value;
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
  assert.ok(/^send-(?:1440|320)-(?:day|night)[.]png$/.test(name) || name === 'send-browser-report.json');
  await prepareOutput(); const filename = path.join(output, name);
  try { const info = await fs.lstat(filename); assert.ok(info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && info.uid === process.getuid()); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  assert.ok(typeof fsConstants.O_NOFOLLOW === 'number');
  const handle = await fs.open(filename, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_NOFOLLOW, 0o600);
  try { const info = await handle.stat(); assert.ok(info.isFile() && info.nlink === 1 && info.uid === process.getuid()); await handle.truncate(0); await handle.writeFile(data); }
  finally { await handle.close(); }
}

function validContext(value) {
  return value?.conversation_id === fixture.conversation_id && value.type === 'direct' && value.permissions?.read === true
    && value.permissions?.send === true && value.permissions?.invite === false && value.permissions?.leave === false;
}
function ownedMessage(value) {
  return value && positive(value.id) && positive(value.seq) && value.seq <= fixture.last_seq + 3
    && value.conversation_id === fixture.conversation_id && value.kind === 'text' && initialBodies.has(value.body)
    && value.sender?.status === 'unavailable' && Array.isArray(value.attachments) && value.attachments.length === 0;
}
async function sendReceipt(response, payload, role) {
  const status = response.status(); assert.ok([200, 201].includes(status));
  const envelope = await response.json(); const data = envelope?.data;
  assert.ok(exact(data, ['message', 'client_message_id', 'replayed', 'read_seq', 'unread_count', 'context']));
  assert.ok(typeof envelope.meta?.request_id === 'string' && validContext(data.context));
  assert.ok(ownedMessage(data.message) && data.message.body === payload.body && data.client_message_id === payload.client_message_id);
  assert.equal(data.replayed, status === 200); assert.ok(Number.isSafeInteger(data.read_seq) && data.read_seq >= 0 && data.read_seq <= fixture.last_seq + 3);
  assert.ok(Number.isSafeInteger(data.unread_count) && data.unread_count >= 0);
  const result = { id: data.message.id, seq: data.message.seq, key: data.client_message_id, body: payload.body, role, status };
  if (status === 201) {
    assert.ok(!newReceipts.has(result.id) && result.seq > fixture.last_seq);
    newReceipts.set(result.id, result); report.newMessages = newReceipts.size;
  }
  return result;
}

async function newActor(role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark', serviceWorkers: 'block' });
  contexts.add(context);
  const actor = { role, context, page: await context.newPage(), login: true, reading: false, expectedBody: null,
    remainingPosts: 0, explicitRead: false, dropNext: false, expectedLossSeen: false, pending: new Set(), failures: [], receipts: [], history: null };
  actor.page.setDefaultTimeout(15000); actor.page.setDefaultNavigationTimeout(25000);
  await context.route('**/*', async (route) => {
    const request = route.request(); const url = new URL(request.url());
    try {
      if (['data:', 'about:', 'blob:'].includes(url.protocol)) return route.continue();
      if (url.origin !== origin) { report.blockedExternalRequests++; return route.abort('blockedbyclient'); }
      const method = request.method(); const isApi = url.pathname.startsWith('/api/');
      if (isApi) {
        assert.equal(request.headers()['x-matcher-chat-actor'], String(fixture.actors[role].id));
        assert.ok(actor.reading);
        if (method === 'GET') assert.ok(url.pathname === '/api/v1/conversations' || url.pathname === messagesPath());
        else if (method === 'POST') {
          assert.equal(url.pathname, messagesPath()); const body = request.postDataJSON();
          assert.ok(exact(body, ['client_message_id', 'body']) && uuid(body.client_message_id) && Object.values(texts).includes(body.body));
          assert.equal(body.body, actor.expectedBody); assert.ok(actor.remainingPosts > 0 && request.headers()['x-csrf-token']);
          actor.remainingPosts--; report.sendPosts++; sentRequests.push({ role, ...body });
          if (actor.dropNext) {
            actor.dropNext = false;
            const committed = await route.fetch({ maxRedirects: 0, maxRetries: 0 });
            assert.equal(committed.status(), 201); lostReceipt = await sendReceipt(committed, body, role);
            report.responseLoss.committedBeforeAbort = true; actor.expectedLossSeen = true;
            await committed.dispose(); return route.abort('failed');
          }
        } else if (method === 'PUT') {
          assert.equal(url.pathname, readPath()); const body = request.postDataJSON();
          assert.ok(actor.explicitRead && exact(body, ['read_seq']) && Number.isSafeInteger(body.read_seq)
            && body.read_seq >= 0 && body.read_seq <= fixture.last_seq + 3 && request.headers()['x-csrf-token']);
          actor.explicitRead = false; report.receiptWrites++;
        } else assert.fail();
      } else if (!['GET', 'HEAD'].includes(method)) {
        assert.ok(actor.login && method === 'POST' && ['/user/auth/login', '/user/auth/password'].includes(url.pathname));
      }
      return route.continue();
    } catch {
      report.blockedUnexpectedRequests++; actor.failures.push('request-policy');
      try { await route.abort('blockedbyclient'); } catch { /* No diagnostic output. */ }
    }
  });
  actor.page.on('pageerror', () => { report.pageErrors++; });
  actor.page.on('console', (entry) => {
    if (!actor.reading || entry.type() !== 'error') return;
    if (actor.expectedLossSeen && entry.text().includes('net::ERR_FAILED')) report.expectedLossConsoleErrors++;
    else report.consoleErrors++;
  });
  actor.page.on('response', (response) => {
    const request = response.request(); const url = new URL(response.url()); if (!url.pathname.startsWith('/api/')) return;
    const pending = (async () => {
      assert.ok(actor.reading);
      if (request.method() === 'POST') { actor.receipts.push(await sendReceipt(response, request.postDataJSON(), role)); return; }
      assert.equal(response.status(), 200); const envelope = await response.json(); const data = envelope?.data;
      assert.ok(data && typeof envelope.meta?.request_id === 'string');
      if (url.pathname === '/api/v1/conversations') {
        report.apiRequests.list++;
        assert.ok(Array.isArray(data.items) && data.items.length === 1 && data.items[0].id === fixture.conversation_id
          && data.items[0].title === 'Synthetic C05 direct' && data.items[0].type === 'direct' && data.items[0].permissions?.send === true
          && (!data.items[0].last_message || initialBodies.has(data.items[0].last_message.body)));
      } else if (url.pathname === messagesPath()) {
        if (url.searchParams.has('after_seq')) report.apiRequests.increment++; else report.apiRequests.history++;
        assert.ok(validContext(data.context) && Array.isArray(data.items) && data.items.every(ownedMessage));
        assert.ok(data.items.every((item, index) => index === 0 || item.seq > data.items[index - 1].seq));
        assert.equal(data.has_more, false); assert.equal(data.next_cursor, null);
        actor.history = { count: data.items.length, ids: data.items.map((item) => item.id), seqs: data.items.map((item) => item.seq), readSeq: data.read_seq, increment: url.searchParams.has('after_seq') };
      } else {
        assert.equal(url.pathname, readPath()); assert.ok(data.read_seq <= fixture.last_seq + 3);
      }
    })().catch(() => actor.failures.push('response-policy'));
    actor.pending.add(pending); void pending.finally(() => actor.pending.delete(pending));
  });
  return actor;
}
async function settled(actor) {
  while (actor.pending.size) await Promise.all([...actor.pending]);
  assert.equal(actor.failures.length, 0); assert.equal(report.blockedUnexpectedRequests, 0);
}

async function nativeLogin(actor) {
  const { page } = actor; const account = fixture.actors[actor.role];
  await page.bringToFront(); const start = await page.goto(origin + '/user/auth/login', { waitUntil: 'networkidle' }); assert.equal(start.status(), 200);
  await page.locator('#login_username:not([readonly])').fill(account.username); await page.locator('#continue-button').click();
  await page.locator('#login_password').waitFor({ state: 'visible' }); assert.equal(new URL(page.url()).pathname, '/user/auth/password');
  assert.equal(await page.locator('#login_username[readonly]').count(), 1); await page.locator('#login_password').fill(account.password);
  const accepted = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/user/auth/password');
  await page.locator('#login-button').click(); assert.equal((await accepted).status(), 302);
  await page.waitForURL((url) => !['/user/auth/login', '/user/auth/password'].includes(url.pathname), { waitUntil: 'domcontentloaded' });
  actor.login = false; report.normalNativeFormLogins++;
}
async function ready(actor) {
  await actor.page.bringToFront(); await actor.page.locator('#matcher-chat-root [data-state="read"]').waitFor({ state: 'visible' });
  await actor.page.locator('#chat-read-draft:not([disabled])').waitFor({ state: 'visible' }); await settled(actor);
}
async function openNative(actor) {
  actor.reading = true; const old = '/mail/mail/show?id=' + fixture.conversation_id;
  const target = '/matcher/chat/conversations/' + fixture.conversation_id;
  await actor.page.bringToFront(); const response = await actor.page.goto(origin + old, { waitUntil: 'networkidle' });
  assert.equal(actor.page.url(), origin + target); assert.equal(response.status(), 200);
  const first = response.request().redirectedFrom(); assert.ok(first && first.redirectedFrom() === null);
  assert.equal(first.url(), origin + old); const redirect = await first.response(); assert.equal(redirect.status(), 302); assert.equal(redirect.headers().location, target);
  assert.ok(response.headers()['cache-control']?.includes('no-store'));
  const html = await response.text(); const match = /<script\b[^>]*\bid=["']matcher-chat-bootstrap["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
  assert.ok(match); const bootstrap = JSON.parse(match[1]); assert.equal(bootstrap.schema_version, 2); assert.equal(bootstrap.integration_stage, 'read');
  assert.equal(bootstrap.actor_id, fixture.actors[actor.role].id);
  await ready(actor); await actor.page.waitForFunction((count) => document.querySelectorAll('[data-message-id]').length === count, fixture.initial_message_count);
  await settled(actor); assert.equal(actor.history.count, fixture.initial_message_count);
  assert.equal(await actor.page.locator('#matcher-chat-bootstrap').textContent(), '');
}
async function noNativeFallback(actor) {
  const { page } = actor;
  const hrefs = await page.locator('#matcher-chat-root a[href]').evaluateAll((items) => items.map((item) => item.getAttribute('href')));
  for (const href of hrefs) {
    if (href === '#conversation-main') continue; const url = new URL(href, origin); assert.equal(url.origin, origin);
    assert.ok(['/dashboard', '/dashboard/dashboard', '/user/auth/login'].includes(url.pathname)
      || url.pathname === '/index.php' && ['dashboard/dashboard', 'user/auth/login'].includes(url.searchParams.get('r')));
  }
  for (const name of ['添加附件，尚未开放', '群聊，尚未开放', '新建会话，尚未开放']) assert.equal(await page.getByRole('button', { name, exact: true, includeHidden: true }).isDisabled(), true);
}

async function imeProbe(actor) {
  await ready(actor); const { page } = actor; const input = page.locator('#chat-read-draft');
  await input.fill(texts.a); await input.focus();
  const focused = await input.evaluate((element) => document.visibilityState === 'visible' && document.hasFocus() && document.activeElement === element);
  if (!focused) { report.ime.status = 'not-exercised-focus-unavailable'; report.limitations.push('Composition simulation could not run in a focused visible textarea.'); return; }
  const before = report.sendPosts;
  await input.dispatchEvent('compositionstart', { data: '合成' });
  await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, isComposing: true, bubbles: true, cancelable: true });
  await page.waitForTimeout(150); await input.dispatchEvent('compositionend', { data: '合成' });
  assert.equal(report.sendPosts, before); assert.equal(await input.inputValue(), texts.a); await settled(actor);
  report.ime.status = 'simulated-events-pass';
}
async function send(actor, body, doubleClick = false) {
  await ready(actor); const { page } = actor; await page.locator('#chat-read-draft').fill(body);
  const before = report.sendPosts; const receiptCount = actor.receipts.length;
  actor.expectedBody = body; actor.remainingPosts = 1;
  const response = page.waitForResponse((value) => new URL(value.url()).pathname === messagesPath() && value.request().method() === 'POST');
  const button = page.getByRole('button', { name: '发送', exact: true });
  if (doubleClick) await button.dblclick({ delay: 40 }); else await button.click();
  assert.equal((await response).status(), 201); await settled(actor);
  assert.equal(actor.receipts.length, receiptCount + 1); assert.equal(report.sendPosts, before + 1);
  const result = actor.receipts.at(-1); await page.locator('[data-message-id="' + result.id + '"]').waitFor();
  await page.locator('#chat-read-draft:not([disabled])').waitFor(); assert.equal(await page.locator('#chat-read-draft').inputValue(), '');
  assert.ok(await page.getByText('已发送。此状态不代表对方已收到或已读。', { exact: true }).isVisible());
  actor.expectedBody = null; await settled(actor); if (doubleClick) report.duplicateClick.onePost = true; return result;
}
async function increment(actor, expectedId) {
  await ready(actor);
  const response = actor.page.waitForResponse((value) => { const url = new URL(value.url()); return url.pathname === messagesPath() && url.searchParams.has('after_seq') && value.request().method() === 'GET'; });
  await actor.page.getByRole('button', { name: '检查新消息', exact: true }).click(); assert.equal((await response).status(), 200);
  await actor.page.locator('[data-message-id="' + expectedId + '"]').waitFor(); await settled(actor);
}
async function uncertain(actor) {
  await ready(actor); const { page } = actor; await page.locator('#chat-read-draft').fill(texts.uncertain);
  actor.expectedBody = texts.uncertain; actor.remainingPosts = 1; actor.dropNext = true;
  const before = report.sendPosts; await page.getByRole('button', { name: '发送', exact: true }).click();
  await page.getByText('发送结果待确认，消息可能已保存。请使用原消息重试；不会自动重发。', { exact: true }).waitFor();
  assert.ok(lostReceipt && report.responseLoss.committedBeforeAbort); assert.equal(report.sendPosts, before + 1);
  assert.equal(await page.locator('#chat-read-draft').inputValue(), texts.uncertain);
  assert.equal(await page.locator('[data-message-id="' + lostReceipt.id + '"]').count(), 0);
  actor.remainingPosts = 1; const receiptCount = actor.receipts.length;
  const response = page.waitForResponse((value) => new URL(value.url()).pathname === messagesPath() && value.request().method() === 'POST');
  await page.getByRole('button', { name: '重试原消息', exact: true }).click(); assert.equal((await response).status(), 200); await settled(actor);
  assert.equal(actor.receipts.length, receiptCount + 1); const replay = actor.receipts.at(-1);
  assert.equal(replay.id, lostReceipt.id); assert.equal(replay.seq, lostReceipt.seq); assert.equal(replay.key, lostReceipt.key);
  const requestPair = sentRequests.slice(-2); assert.equal(requestPair[0].client_message_id, requestPair[1].client_message_id); assert.equal(requestPair[0].body, requestPair[1].body);
  report.responseLoss.sameKeyBodyReplay = true; report.responseLoss.samePersistentMessage = true;
  await page.locator('[data-message-id="' + replay.id + '"]').waitFor(); await page.locator('#chat-read-draft:not([disabled])').waitFor();
  actor.expectedBody = null; await settled(actor); return replay;
}

async function viewport(actor, width, dark) {
  const { page } = actor; await page.setViewportSize({ width, height: width === 320 ? 740 : 1000 }); await ready(actor);
  if (dark !== await page.locator('html').evaluate((element) => element.classList.contains('dark'))) {
    await page.getByRole('button', { name: dark ? '切换至夜间模式' : '切换至日间模式', exact: true }).click();
  }
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(120); await noNativeFallback(actor); await settled(actor);
  assert.equal(await page.locator('[data-message-id]').count(), fixture.initial_message_count + 3);
  const metrics = await page.evaluate(() => {
    const controls = [...document.querySelectorAll('#matcher-chat-root a, #matcher-chat-root button:not([disabled]), #matcher-chat-root textarea:not([disabled]), #matcher-chat-root h1, #matcher-chat-root h2')]
      .map((element) => ({ element, rect: element.getBoundingClientRect() })).filter(({ rect }) => rect.width > 0 && rect.height > 0);
    return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, dark: document.documentElement.classList.contains('dark'),
      clippedCount: controls.filter(({ rect }) => rect.left < -1 || rect.right > innerWidth + 1).length,
      smallTargetCount: controls.filter(({ element, rect }) => !/^H[12]$/.test(element.tagName) && rect.height < 40).length };
  });
  assert.ok(metrics.scrollWidth <= width + 1); assert.equal(metrics.clippedCount, 0); assert.equal(metrics.smallTargetCount, 0); assert.equal(metrics.dark, dark);
  report.viewports.push(metrics); const name = 'send-' + width + '-' + (dark ? 'night' : 'day') + '.png';
  await artifact(name, await page.screenshot({ fullPage: true })); report.screenshots.push(name);
}

try {
  fixture = await readInput(); await prepareOutput(); const { chromium } = require('playwright'); browser = await chromium.launch({ headless: true });
  stage = 'login-and-native-entry-a'; const a = await newActor('a'); await nativeLogin(a); await openNative(a);
  stage = 'login-and-native-entry-b'; const b = await newActor('b'); await nativeLogin(b); await openNative(b);
  check('Two synthetic accounts use native login and one-hop authorized old-show navigation');
  stage = 'ime-simulation'; await imeProbe(a);
  stage = 'send-a-double-click'; const first = await send(a, texts.a, true);
  check('A explicit double-click sends one persistent message; simulated IME evidence is separately labeled');
  stage = 'b-read-and-reply'; await increment(b, first.id); const second = await send(b, texts.b);
  stage = 'a-read-b'; await increment(a, second.id);
  check('Both accounts explicitly retrieve the peer message and B sends a real reply');
  stage = 'uncertain-response-retry'; const third = await uncertain(a); await increment(b, third.id);
  check('A committed response is deliberately lost; explicit original-key retry returns the same persisted message');
  stage = 'refresh-persistence'; await a.page.bringToFront(); await a.page.reload({ waitUntil: 'networkidle' }); await ready(a);
  await a.page.waitForFunction((count) => document.querySelectorAll('[data-message-id]').length === count, fixture.initial_message_count + 3);
  await settled(a); assert.equal(a.history.count, fixture.initial_message_count + 3); assert.equal(Math.max(...a.history.seqs), fixture.last_seq + 3);
  assert.equal(report.newMessages, 3); assert.equal(report.sendPosts, 4); assert.equal(report.receiptWrites, 0);
  check('Refresh retains exactly three new messages and no implicit read-state PUT');
  stage = 'viewport-layout'; for (const width of [1440, 320]) for (const dark of [false, true]) await viewport(a, width, dark);
  check('1440px/320px day/night retain text composer, disabled unsupported features and safe exit links');
  assert.equal(report.normalNativeFormLogins, 2); assert.equal(report.blockedExternalRequests, 0); assert.equal(report.blockedUnexpectedRequests, 0);
  assert.equal(report.pageErrors, 0); assert.equal(report.consoleErrors, 0); assert.ok(report.expectedLossConsoleErrors <= 1);
  report.limitations.push('Composition events were simulated in the browser; this is not real OS/input-method certification.');
  report.limitations.push('Focus/visibility lifecycle and read-state writes were not verified by this send exercise.');
  report.limitations.push('No provider authentication, groups, attachments, friend-request workflow or production deployment is certified.');
  report.passed = true;
} catch {
  report.failure = { stage, reason: 'Sanitized verification failure; no credential, request, response or exception text included.' }; process.exitCode = 1;
} finally {
  for (const context of contexts) { try { await context.close(); } catch { /* Never forward diagnostics. */ } }
  if (browser) { try { await browser.close(); } catch { /* Never forward diagnostics. */ } }
  try { await artifact('send-browser-report.json', JSON.stringify(report, null, 2)); }
  catch { report.passed = false; report.failure = { stage: 'safe-output', reason: 'Fixed output refused.' }; process.exitCode = 1; }
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, normalNativeFormLogins: report.normalNativeFormLogins,
    newMessages: report.newMessages, sendPosts: report.sendPosts, receiptWrites: report.receiptWrites, failedStage: report.failure?.stage ?? null,
    report: 'integration/artifacts/send-browser/send-browser-report.json' }));
}
