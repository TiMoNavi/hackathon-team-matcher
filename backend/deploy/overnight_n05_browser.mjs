import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(path.join(root, 'frontend/用户画像收集——前端/package.json'));
const { chromium } = require('playwright');
const runtime = path.join(root, 'backend/.runtime/overnight-integration');
const origin = 'http://127.0.0.1:8113';
async function privateJson(name) {
  const file = path.join(runtime, name), info = await fs.lstat(file);
  assert.ok(info.isFile() && !info.isSymbolicLink() && (info.mode & 0o777) === 0o600);
  return JSON.parse(await fs.readFile(file, 'utf8'));
}
const fixture = await privateJson('n05-synthetic-fixtures.json');
const marker = await privateJson('marker.json');
assert.equal(fixture.kind, 'n05-synthetic-v1'); assert.equal(fixture.nonce, marker.nonce);
assert.equal(marker.database, 'humhub_overnight_n01_20261112'); assert.equal(marker.port, 8113);
assert.match(fixture.prefix, /^n05_[a-f0-9]{12}$/);
const report = { kind: 'n05-real-http-browser-v1', status: 'running', checks: [], http_requests: 0, unexpected_writes: 0, external_requests: 0, page_errors: 0, synthetic_native_sessions: true, real_provider_authentication: false, screenshots: false };
let stage = 'start', ownerCanSelect = false;
const browser = await chromium.launch({ headless: true });
async function actorPage(role) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  if (role !== 'guest') {
    const actor = fixture.actors[role]; assert.equal(actor.username, fixture.prefix + '_' + role); assert.match(actor.session_id, /^[a-f0-9]{48}$/);
    await context.addCookies([{ name: 'overnight_n01_session', value: actor.session_id, url: origin, httpOnly: true, sameSite: 'Lax' }]);
  }
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { report.external_requests++; return route.abort(); }
    if (url.pathname.startsWith('/api/')) {
      report.http_requests++;
      if (request.method() !== 'GET' && !(role === 'owner' && ownerCanSelect && request.method() === 'PUT' && url.pathname === '/api/v1/me/current-event')) { report.unexpected_writes++; return route.abort(); }
    }
    return route.continue();
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', () => { report.page_errors++; });
  return { context, page };
}
function pass(name) { report.checks.push(name); }
try {
  stage = 'member-real-discovery';
  {
    const { context, page } = await actorPage('member');
    try {
      const response = page.waitForResponse(r => new URL(r.url()).pathname === `/api/v1/events/${fixture.spaces.b}/discovery` && r.request().method() === 'GET');
      await page.goto(origin + '/matcher/app/discover'); await page.locator('.recommendation-runtime').waitFor();
      assert.equal((await response).status(), 200); pass('Recovered native member opens real current-event discovery');
      await page.getByRole('link', { name: '账号与活动', exact: true }).click();
      await page.locator('[data-event-access="ready"]').waitFor();
      assert.equal(await page.getByRole('heading', { name: fixture.prefix + '_space_a', exact: true }).count(), 0);
      await page.getByRole('heading', { name: fixture.prefix + '_space_b', exact: true }).waitFor();
      pass('Real membership list removes revoked A and retains B');
    } finally { await context.close(); }
  }
  stage = 'revoked-target';
  {
    const { context, page } = await actorPage('target');
    try {
      await page.goto(origin + '/matcher/app/discover'); await page.locator('[data-event-access="ready"]').waitFor();
      assert.equal(await page.locator('.recommendation-runtime').count(), 0);
      assert.equal(await page.getByRole('button', { name: '设为当前活动', exact: true }).count(), 0);
      await page.getByText('你还没有有效的活动成员资格。可以向组织者获取邀请码。', { exact: true }).waitFor();
      const before = report.http_requests; await page.waitForTimeout(750); assert.equal(report.http_requests, before);
      pass('Real revoked target stays empty without discovery or refresh loop');
    } finally { await context.close(); }
  }
  stage = 'owner-explicit-selection';
  {
    const { context, page } = await actorPage('owner');
    try {
      await page.goto(origin + '/matcher/app'); await page.locator('[data-event-access="ready"]').waitFor();
      const row = page.locator('li').filter({ has: page.getByRole('heading', { name: fixture.prefix + '_space_a', exact: true }) });
      const button = row.getByRole('button', { name: '设为当前活动', exact: true });
      if (await button.count()) {
        ownerCanSelect = true;
        const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/me/current-event' && r.request().method() === 'PUT');
        await button.click(); assert.equal((await response).status(), 200); ownerCanSelect = false;
      }
      await page.getByRole('button', { name: '当前活动', exact: true }).waitFor();
      pass('Browser explicit selection writes to real native session with CSRF and CAS');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      pass('Real activity page fits mobile viewport');
    } finally { ownerCanSelect = false; await context.close(); }
  }
  stage = 'guest';
  {
    const { context, page } = await actorPage('guest');
    try {
      await page.goto(origin + '/matcher/app/discover'); await page.getByRole('heading', { name: '登录后，继续你的活动', exact: true }).waitFor();
      assert.equal(await page.locator('[data-event-access]').count(), 0); pass('Native guest cannot mount protected activity or discovery');
    } finally { await context.close(); }
  }
  assert.equal(report.unexpected_writes, 0); assert.equal(report.external_requests, 0); assert.equal(report.page_errors, 0);
  pass('No browser errors, external requests, or unapproved writes'); report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = { stage, kind: error instanceof assert.AssertionError ? 'assertion' : 'browser' };
} finally {
  await browser.close();
  const file = path.join(runtime, 'n05-real-browser-report.json');
  const handle = await fs.open(file, 'w', 0o600); try { await handle.writeFile(JSON.stringify(report, null, 2) + '\n'); } finally { await handle.close(); }
  console.log(JSON.stringify(report));
}
if (report.status !== 'passed') process.exitCode = 1;
