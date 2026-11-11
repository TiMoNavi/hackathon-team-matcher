import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4200/';
const results = { checks: [], errors: [], measurements: [] };
const directory = 'docs/screenshots/v6-height';
mkdirSync(directory, { recursive: true });
const check = (name, passed, detail) => {
  results.checks.push({ name, passed, detail });
  console.log((passed ? 'PASS ' : 'FAIL ') + name);
  if (!passed) throw new Error(name + ' ' + JSON.stringify(detail));
};
const read = page => page.evaluate(() => {
  const header = document.querySelector('.presentation-header').getBoundingClientRect();
  const stage = document.querySelector('.presentation-stage').getBoundingClientRect();
  return {
    viewport: [innerWidth, innerHeight], headerBottom: header.bottom, stageTop: stage.top, stageBottom: stage.bottom, stageHeight: stage.height,
    documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight,
    panels: [...document.querySelectorAll('.presentation-panel')].map(p => ({ id: p.dataset.scene, height: p.clientHeight, scroll: p.scrollHeight })),
  };
});
const settle = async (page, id) => {
  await page.waitForFunction(id => document.querySelector('.presentation-panel[data-state="active"]')?.dataset.scene === id, id);
  await page.waitForFunction(() => document.querySelector('.presentation-shell').dataset.transitioning === 'false');
  await page.waitForTimeout(400);
};
const scene = async (page, id) => { await page.evaluate(id => { location.hash = id; }, id); await settle(page, id); };
const activeFits = page => page.locator('.presentation-panel[data-state="active"]').evaluate(p => p.scrollHeight <= p.clientHeight + 1 && p.scrollTop === 0);
const open = async (width, height, reducedMotion = 'reduce') => {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion });
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => results.errors.push(error.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.documentElement.dataset.view === 'presentation');
  // Wait for a painted frame, not only the viewport resize acknowledgement.
  await page.screenshot({ animations: 'disabled' });
  return page;
};
try {
  for (const [width, height] of [[1920,1080],[1440,900],[1366,768],[1280,800],[1280,720],[1024,768]]) {
    const page = await open(width, height);
    const measure = await read(page);
    results.measurements.push(measure);
    check('Header and stage fill viewport ' + width + 'x' + height, Math.abs(measure.headerBottom - measure.stageTop) < 1 && Math.abs(measure.stageBottom - height) < 1 && measure.documentWidth === width && measure.documentHeight === height, measure);
    check('All six scenes fit without extra scroll ' + width + 'x' + height, measure.panels.every(p => p.scroll <= p.height + 1), measure.panels);
    if ((width === 1280 && height === 720) || width === 1024) {
      for (const id of ['top','people','profile','recommendations','community','invitation']) {
        await scene(page, id);
        await page.screenshot({ path: directory + '/' + width + '-' + id + '.png', animations: 'disabled' });
      }
      await scene(page, 'profile');
      for (const name of ['GitHub','个人简历','作品网站']) {
        await page.getByRole('button', { name: '查看' + name + '示例画像', exact: true }).click();
        await page.waitForTimeout(150);
        check('Profile source fits ' + name + ' at ' + width, await activeFits(page), await read(page));
      }
      await scene(page, 'recommendations');
      for (let index = 0; index < 3; index++) {
        await page.getByRole('button', { name: '下一位队友', exact: true }).click();
        await page.waitForTimeout(150);
        check('Recommendation content fits candidate ' + index + ' at ' + width, await activeFits(page), await read(page));
      }
      await scene(page, 'community');
      await page.getByRole('button', { name: '体验加入活动', exact: true }).click();
      check('Activity join and status remain visible at ' + width, await activeFits(page));
    }
    await page.close();
  }
  const desktop = await open(1366, 768, 'no-preference');
  await desktop.waitForFunction(() => document.documentElement.dataset.motion === 'running');
  await desktop.mouse.move(24, 400);
  for (const id of ['people','profile','recommendations','community','invitation']) {
    await desktop.mouse.wheel(0, 120);
    await settle(desktop, id);
    check('One downward gesture opens ' + id + ' with no extra scroll', await activeFits(desktop));
  }
  for (const id of ['community','recommendations','profile','people','top']) {
    await desktop.mouse.wheel(0, -120);
    await settle(desktop, id);
    check('One upward gesture returns to ' + id + ' with no extra scroll', await activeFits(desktop));
  }
  await desktop.close();
  const mobile = await open(390, 844);
  await mobile.getByRole('button', { name: '打开导航', exact: true }).click();
  await mobile.waitForTimeout(200);
  const expanded = await read(mobile);
  check('Expanded mobile menu reserves its actual height', expanded.headerBottom > 200 && Math.abs(expanded.stageTop - expanded.headerBottom) < 1 && Math.abs(expanded.stageBottom - 844) < 1, expanded);
  await mobile.getByRole('button', { name: '收起导航', exact: true }).click();
  await mobile.waitForTimeout(200);
  check('Mobile hero fits under collapsed menu', await activeFits(mobile));
  await mobile.screenshot({ path: directory + '/390-top.png', animations: 'disabled' });
  await scene(mobile, 'invitation');
  check('Mobile invitation fits below the header', await activeFits(mobile), await read(mobile));
  await mobile.screenshot({ path: directory + '/390-invitation.png', animations: 'disabled' });
  await scene(mobile, 'profile');
  const panel = mobile.locator('.presentation-panel[data-state="active"]');
  check('Long mobile content remains scrollable', await panel.evaluate(p => p.scrollHeight > p.clientHeight && getComputedStyle(p).overflowY === 'auto'));
  await panel.evaluate(p => { p.scrollTop = p.scrollHeight; });
  const footer = await mobile.locator('#profile > div:first-child > div:last-child').boundingBox();
  check('Mobile final content can be fully read', footer.y >= 88 && footer.y + footer.height <= 844);
  await mobile.screenshot({ path: directory + '/390-profile-bottom.png', animations: 'disabled' });
  await mobile.setViewportSize({ width: 390, height: 667 });
  await mobile.screenshot({ animations: 'disabled' });
  const resized = await read(mobile);
  check('Stage updates when viewport height changes', Math.abs(resized.stageBottom - 667) < 1 && Math.abs(resized.stageTop - resized.headerBottom) < 1, resized);
  await mobile.close();
  check('No browser runtime errors', results.errors.length === 0, results.errors);
  results.passed = true;
} catch (error) { results.passed = false; results.failure = error.stack; console.error(error.stack); }
finally { writeFileSync('docs/v6-height-verification.json', JSON.stringify(results, null, 2)); await browser.close(); }
if (!results.passed) process.exit(1);
