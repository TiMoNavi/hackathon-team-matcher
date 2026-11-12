import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(path.join(root, 'frontend/用户画像收集——前端/package.json'));
const { chromium } = require('playwright');
const assets = path.join(root, 'backend/protected/modules/matcher-webapp/resources/app');
const output = path.join(root, 'frontend/推荐/artifacts/recommendation-host-2026-11-12');
await fs.mkdir(output, { recursive: true });
const manifest = JSON.parse(await fs.readFile(path.join(assets, 'manifest.json'), 'utf8'));
const entry = manifest['index.html'];
const bootstrap = { schema_version: 1, base_path: '/matcher/app', api_base: '/api/v1', native_home_url: '/dashboard', native_login_url: '/user/auth/login', csrf_header: 'X-CSRF-Token', csrf_token: 'synthetic-host-test-only' };
const pageHtml = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + entry.css.map(file => '<link rel="stylesheet" href="/test-assets/' + file + '">').join('') + '</head><body><div id="matcher-webapp-root"></div><script id="matcher-webapp-bootstrap" type="application/json">' + JSON.stringify(bootstrap) + '</script><script type="module" src="/test-assets/' + entry.file + '"></script></body></html>';
let mode = 'guest'; const counts = { me: 0, currentEvent: 0, discovery: 0, mutations: 0, models: 0 };
const checks = []; const errors = []; const external = []; const screenshots = [];
const meta = { request_id: '0123456789abcdef01234567' };
const send = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(status >= 400 ? { error: { code: data, message: 'Synthetic test status', retryable: false, details: [] }, meta } : { data, meta })); };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method !== 'GET') { counts.mutations++; return send(res, 405, 'METHOD_NOT_ALLOWED'); }
    if (url.pathname.startsWith('/test-assets/')) {
      const name = url.pathname.slice('/test-assets/'.length); const file = path.resolve(assets, name);
      if (!file.startsWith(assets + path.sep)) return send(res, 404, 'MISSING');
      const mime = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'font/woff2';
      res.writeHead(200, { 'Content-Type': mime }); res.end(await fs.readFile(file)); return;
    }
    if (url.pathname.startsWith('/matcher/app')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(pageHtml); return; }
    if (url.pathname === '/api/v1/me') { counts.me++; return mode === 'guest' ? send(res, 401, 'AUTHENTICATION_REQUIRED') : send(res, 200, { user_id: 1, nickname: '虚构宿主测试账号', identity_version: 1, avatar_ref: null }); }
    if (url.pathname === '/api/v1/me/current-event') { counts.currentEvent++; return mode === 'no_event' ? send(res, 409, 'CURRENT_EVENT_REQUIRED') : send(res, 200, { space_id: 17, selection_revision: 'selection-' + 'a'.repeat(32), access_version: 'synthetic-host-access' }); }
    if (url.pathname === '/api/v1/events/17/discovery') { counts.discovery++; return send(res, 200, { space_id: 17, target_type: 'person', sort: 'recent', limit: 24, items: [], next_cursor: null, has_more: false, exhausted: true }); }
    if (url.pathname === '/api/v1/auth/capabilities') return send(res, 200, { github_available: true, email_available: true });
    if (url.pathname === '/api/v1/auth/github/import-status') return send(res, 200, { state: 'not_requested', source_id: null });
    if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    return send(res, 404, 'MISSING');
  } catch { res.writeHead(500); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.route('**/*', route => { if (new URL(route.request().url()).origin !== origin) { external.push('blocked'); return route.abort(); } return route.continue(); });
const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
let failure = null;
try {
  await page.goto(origin + '/matcher/app/discover', { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: '登录后，继续你的活动' }).waitFor();
  assert.equal(await page.locator('.recommendation-runtime').count(), 0); assert.equal(counts.discovery, 0); checks.push('Guest discover deep link renders native-session login gate with zero discovery requests');
  mode = 'no_event'; await page.reload({ waitUntil: 'networkidle' }); await page.getByText('尚未选择活动', { exact: true }).waitFor();
  assert.equal(await page.locator('.recommendation-runtime').count(), 0); assert.equal(counts.discovery, 0); checks.push('Signed-in account without current event cannot mount discovery');
  mode = 'selected'; await page.reload({ waitUntil: 'networkidle' }); await page.locator('.recommendation-runtime').waitFor();
  await page.waitForTimeout(200); assert.ok(counts.discovery > 0); checks.push('Actual compiled host mounts the connected recommendation entry and calls same-origin discovery');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 }); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(100);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Host discovery overflow at ' + width);
    const file = 'discover-host-' + width + '.png'; await page.screenshot({ path: path.join(output, file), fullPage: true }); screenshots.push(file); checks.push('Compiled discover host fits ' + width + 'px without horizontal overflow');
  }
  const beforeTheme = counts.discovery; await page.getByRole('button', { name: '切换夜间模式', exact: true }).click(); await page.waitForTimeout(250);
  assert.equal(counts.discovery, beforeTheme); checks.push('Host theme update does not recreate the controller or silently reload discovery');
  mode = 'guest'; await page.goto(origin + '/matcher/app/login', { waitUntil: 'networkidle' }); await page.getByRole('button', { name: '使用 GitHub 登录', exact: true }).waitFor();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 }); await page.waitForTimeout(100);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Four-tab login overflow at ' + width);
    const clipped = await page.locator('.webapp-tabs a').evaluateAll(nodes => nodes.some(node => { const r = node.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth + 1; }));
    assert.equal(clipped, false); const file = 'login-host-' + width + '.png'; await page.screenshot({ path: path.join(output, file), fullPage: true }); screenshots.push(file); checks.push('Login plus discover navigation fits ' + width + 'px');
  }
  assert.equal(counts.mutations, 0); assert.deepEqual(errors, []); assert.deepEqual(external, []); checks.push('Host rendering performs no mutations, external requests, or model calls');
} catch (error) { failure = error.message; }
finally {
  await browser.close(); await new Promise(resolve => server.close(resolve));
  const report = { checked_at: new Date().toISOString(), status: failure ? 'failed' : 'passed', scope: 'Actual final build plus synthetic same-origin API; not real user authentication or DB acceptance', checks, counts, errors, external, failure, screenshots, assets: entry };
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, checks: checks.length, failure, report: path.relative(root, path.join(output, 'report.json')) }));
}
if (failure) process.exitCode = 1;
