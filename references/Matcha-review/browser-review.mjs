import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const out = fileURLToPath(new URL('./artifacts/', import.meta.url));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.MATCHA_CHROMIUM ? { executablePath: process.env.MATCHA_CHROMIUM } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
const apiRequests = [];
page.on('pageerror', e => errors.push(e.message));
page.on('request', r => { if (['fetch', 'xhr'].includes(r.resourceType())) apiRequests.push({ method: r.method(), url: r.url() }); });
const report = {};
try {
  await page.goto('http://127.0.0.1:5178/', { waitUntil: 'networkidle' });
  report.landing = { title: await page.title(), headings: await page.locator('h1,h2').allTextContents() };
  await page.screenshot({ path: out + 'landing.png', fullPage: true });
  await page.goto('http://127.0.0.1:5178/login');
  await page.locator('input[type=email]').fill('review@example.invalid');
  await page.locator('input[type=password]').fill('arbitrary-password');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.waitForURL(url => !url.pathname.includes('login'));
  report.login = { url: page.url(), apiRequests: [...apiRequests], storage: await page.evaluate(() => ({ keys: Object.keys(localStorage), currentUser: localStorage.getItem('matcha_current_user') })) };
  await page.screenshot({ path: out + 'after-login.png', fullPage: true });
  // Client-side route transition preserves the real mock login's React state.
  await page.evaluate(() => { history.pushState({}, '', '/messages?user=review-peer&name=ReviewPeer'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByPlaceholder('Type a message...').fill('Local review message');
  await page.locator('form button[type=submit]').click();
  await page.getByText('ReviewPeer has joined your team!', { exact: true }).waitFor();
  report.messaging = { autoReply: await page.getByText("Sure, I'd love to join!", { exact: true }).count(), team: await page.evaluate(() => JSON.parse(localStorage.getItem('matcha_team'))), apiRequests: [...apiRequests] };
  await page.screenshot({ path: out + 'messages.png', fullPage: true });
  await page.reload();
  await page.waitForURL('**/login');
  report.afterReload = { url: page.url(), currentUser: await page.evaluate(() => localStorage.getItem('matcha_current_user')) };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:5178/');
  await page.screenshot({ path: out + 'landing-mobile.png', fullPage: true });
  report.mobile = await page.evaluate(() => ({ viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth }));
} catch (e) {
  report.failure = e.stack;
  await page.screenshot({ path: out + 'failure.png', fullPage: true });
  process.exitCode = 1;
} finally {
  report.pageErrors = errors;
  await writeFile(out + 'browser-review.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}
