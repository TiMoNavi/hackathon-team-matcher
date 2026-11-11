import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const results = { checks: [], errors: [] };
const check = (name, passed, detail) => { results.checks.push({ name, passed, detail }); if (!passed) throw new Error(name); };
page.on('pageerror', error => results.errors.push(error.message));
try {
  await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4200/', { waitUntil: 'networkidle' });
  await page.getByRole('button',{name:'切换为连续浏览',exact:true}).click();
  check('Five coordinated two-line headings', await page.locator('.kinetic-heading').count() === 5 && await page.locator('.kinetic-line').count() === 10);
  const heading = page.locator('#profile-title');
  await heading.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => [...document.querySelectorAll('#profile-title .ui-trv__p')].every(n => getComputedStyle(n).opacity === '1'));
  const replay = page.locator('#profile .kinetic-replay');
  await replay.click();
  check('Replay resets letter entrance', await heading.locator('.ui-trv__p').evaluateAll(nodes => nodes.some(n => Number(getComputedStyle(n).opacity) < .9)));
  await page.waitForFunction(() => [...document.querySelectorAll('#profile-title .ui-trv__p')].every(n => getComputedStyle(n).opacity === '1'));
  check('Both lines finish readable', await heading.locator('.ui-trv__p').evaluateAll(nodes => nodes.every(n => getComputedStyle(n).opacity === '1')));
  const pigment = await heading.locator('.kinetic-ink .ui-trv__p').first().evaluate(n => getComputedStyle(n).backgroundPosition);
  await page.waitForFunction(before => getComputedStyle(document.querySelector('#profile-title .kinetic-ink .ui-trv__p')).backgroundPosition !== before, pigment);
  check('Letter pigment continues flowing after entrance', true);
  const surface = page.locator('.profile-material');
  await surface.scrollIntoViewIfNeeded();
  let box = await surface.boundingBox();
  await page.mouse.move(box.x + box.width * .25, box.y + box.height * .3);
  await page.waitForFunction(() => !!document.querySelector('.profile-material').style.getPropertyValue('--surface-x'));
  const first = await surface.evaluate(n => n.style.getPropertyValue('--surface-x'));
  await page.mouse.move(box.x + box.width * .75, box.y + box.height * .3);
  await page.waitForFunction(before => document.querySelector('.profile-material').style.getPropertyValue('--surface-x') !== before, first);
  check('Reflection tracks mouse without moving content', true);
  const edge = await surface.evaluate(n => getComputedStyle(n, '::before').backgroundPosition);
  await page.waitForFunction(before => getComputedStyle(document.querySelector('.profile-material'), '::before').backgroundPosition !== before, edge);
  check('Tinted edge changes over time', true);
  await page.getByRole('button', { name: '暂停页面动画', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.profile-material').dataset.surfaceStill === 'true');
  check('Pause reveals every heading and disables replay', await page.locator('.kinetic-heading .ui-trv__p').evaluateAll(nodes => nodes.every(n => getComputedStyle(n).opacity === '1')) && await page.locator('.kinetic-replay:disabled').count() === 5);
  check('Pause stops material edge and glow', await surface.evaluate(n => ['::before','::after'].every(p => getComputedStyle(n,p).animationPlayState === 'paused')));
  await surface.scrollIntoViewIfNeeded();
  box = await surface.boundingBox();
  const still = await surface.evaluate(n => n.style.getPropertyValue('--surface-x'));
  await page.mouse.move(box.x + box.width * .4, box.y + box.height * .4);
  await page.waitForTimeout(120);
  check('Paused reflection ignores pointer motion', still === await surface.evaluate(n => n.style.getPropertyValue('--surface-x')));
  check('Recommendation no longer has an enclosing card', await page.locator('.recommendation-stage').evaluate(n => getComputedStyle(n).boxShadow === 'none' && getComputedStyle(n).borderRadius === '0px'));
  for (const width of [1440,1024,768,390,320]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const typography = await page.locator('.kinetic-heading').evaluateAll(nodes => nodes.map(n => ({ id:n.id, width:n.clientWidth, scroll:n.scrollWidth, height:n.getBoundingClientRect().height, lineHeight:parseFloat(getComputedStyle(n).lineHeight) })));
    check('Headings fit in two lines at ' + width, typography.every(n => n.scroll <= n.width + 1 && n.height <= n.lineHeight * 2.2), typography);
    check('Page fits viewport at ' + width, await page.evaluate(() => document.documentElement.scrollWidth === innerWidth));
    if (width === 1440 || width === 390) {
      for (const id of ['people','profile','recommendations','community']) {
        await page.locator('#'+id).scrollIntoViewIfNeeded();
        await page.locator('#'+id).screenshot({path:'docs/screenshots/'+width+'-'+id+'.png'});
      }
      await page.locator('footer').scrollIntoViewIfNeeded();
      await page.screenshot({path:'docs/screenshots/'+width+'-full.png',fullPage:true});
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.documentElement.dataset.motion === 'paused');
  check('Reduced motion renders every heading immediately', await page.locator('.kinetic-heading .ui-trv__p').evaluateAll(nodes => nodes.every(n => getComputedStyle(n).opacity === '1' && getComputedStyle(n).animationName === 'none')));
  check('No runtime errors', results.errors.length === 0, results.errors);
  results.passed = true;
} catch (error) { results.passed = false; results.failure = error.stack; }
finally { writeFileSync('docs/v4-verification.json', JSON.stringify(results,null,2)); console.log(JSON.stringify(results,null,2)); await browser.close(); }
if (!results.passed) process.exit(1);
