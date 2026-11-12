// Visible, fresh browser for the user's own authentication actions.
// No screenshots, traces, cookies, credentials, email, code, or OAuth query values are saved.
import { createRequire } from 'node:module';
import { readFile, writeFile, rename, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'frontend/用户画像收集——前端/package.json'));
const { chromium } = require('playwright');
const origin = 'http://127.0.0.1:8113';
const runtime = path.join(root, 'backend/.runtime');
const inputPath = path.join(runtime, 'overnight-auth-input.json');
const info = await lstat(inputPath);
if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o600) throw new Error('Private input permissions refused.');
const input = JSON.parse(await readFile(inputPath, 'utf8'));
if (input.base_url !== origin || typeof input.verification?.test_email !== 'string') throw new Error('Private input target refused.');
const report = { status: 'awaiting_user', session: 'fresh-visible-browser', emails_accepted: 0,
  email_verifications: [], github_intents: [], github_callbacks: 0, successful_me_reads: 0,
  authenticated_account_consistent: true, current_event_statuses: [], explicit_logouts: 0,
  read_errors: 0, screenshot_taken: false, cookies_exported: false };
let firstUserId = null;
const reportPath = path.join(runtime, 'overnight-auth-browser-status.json');
let saved = Promise.resolve();
async function save() {
  const snapshot = JSON.stringify(report, null, 2) + '\n';
  saved = saved.then(async () => {
    const temporary = reportPath + '.tmp-' + process.pid;
    await writeFile(temporary, snapshot, { mode: 0o600 });
    await rename(temporary, reportPath);
  });
  await saved;
}
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1120, height: 850 } });
const page = await context.newPage();
let closing = false;
page.on('response', async response => {
  try {
    const url = new URL(response.url());
    if (url.origin !== origin) return;
    const status = response.status();
    if (url.pathname === '/api/v1/auth/email-codes' && status === 202) report.emails_accepted++;
    if (url.pathname === '/api/v1/auth/email/verify') report.email_verifications.push(status);
    if (url.pathname === '/api/v1/auth/github/start') {
      const intent = url.searchParams.get('intent');
      if (['login', 'bind'].includes(intent)) report.github_intents.push({ intent, status });
    }
    if (url.pathname === '/user/auth/external' && url.searchParams.get('authclient') === 'github'
        && (url.searchParams.has('code') || url.searchParams.has('error'))) report.github_callbacks++;
    if (url.pathname === '/api/v1/auth/logout' && status === 200) report.explicit_logouts++;
    if (url.pathname === '/api/v1/me' && status === 200) {
      const payload = await response.json();
      const id = payload?.data?.user_id;
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Identity response refused.');
      if (firstUserId === null) firstUserId = id;
      else if (firstUserId !== id) report.authenticated_account_consistent = false;
      report.successful_me_reads++;
    }
    if (url.pathname === '/api/v1/me/current-event') report.current_event_statuses.push(status);
    await save();
  } catch { report.read_errors++; await save(); }
});
await page.goto(origin + '/matcher/app/login', { waitUntil: 'networkidle' });
await page.locator('#webapp-email').fill(input.verification.test_email);
await save();
console.log(JSON.stringify({ status: 'awaiting_user', visible_browser_open: true, email_prefilled: true, sends_triggered_by_script: 0 }));
async function close() {
  if (closing) return;
  closing = true; report.status = 'browser_closed'; await save();
  await context.close(); await browser.close(); process.exit(0);
}
process.on('SIGTERM', close); process.on('SIGINT', close);
browser.on('disconnected', async () => { if (!closing) { closing = true; report.status = 'browser_closed'; await save(); process.exit(0); } });
// An idle observer does not perform API polling or retry any authentication operation.
setTimeout(close, 30 * 60 * 1000);
await new Promise(() => {});
