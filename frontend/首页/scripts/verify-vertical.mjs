import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4200/';
const results = { checks: [], errors: [], widths: [] };
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
page.on('pageerror', error => results.errors.push(error.message));
const check = (name, passed, detail) => { results.checks.push({ name, passed, detail }); console.log((passed ? 'PASS ' : 'FAIL ') + name); if (!passed) throw new Error(name + ' ' + JSON.stringify(detail)); };
const current = p => p.locator('.presentation-panel[data-state="active"]').getAttribute('data-scene');
const panel = p => p.locator('.presentation-panel[data-state="active"]');
const settle = async (p, id) => { await p.waitForFunction(id => document.querySelector('.presentation-panel[data-state="active"]')?.dataset.scene === id, id); await p.waitForFunction(() => document.querySelector('.presentation-shell').dataset.transitioning === 'false'); await p.waitForTimeout(350); };
const scene = async (p, id) => { await p.evaluate(id => { location.hash = id; }, id); await settle(p, id); };
const edge = async (p, end) => panel(p).evaluate((node, end) => { node.scrollTop = end ? node.scrollHeight : 0; }, end);
mkdirSync('docs/screenshots/v6', { recursive: true });
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.documentElement.dataset.motion === 'running');
  check('Bottom toolbar, counter and progress strip removed', await page.locator('.presentation-controls,.scene-pager,.scene-counter,.scene-progress,.presentation-mode').count() === 0);
  check('Six scenes retained with only one interactive', await page.locator('.presentation-panel').count() === 6 && await page.locator('.presentation-panel[inert]').count() === 5);
  await page.evaluate(() => {
    window.__verticalFrames = [];
    new MutationObserver(() => {
      const active = document.querySelector('.presentation-panel[data-state="active"]');
      if (document.querySelector('.presentation-shell').dataset.transitioning === 'true') {
        const matrix = new DOMMatrix(getComputedStyle(active).transform);
        window.__verticalFrames.push({ direction: document.querySelector('.presentation-shell').dataset.direction, x: matrix.m41, y: matrix.m42 });
      }
    }).observe(document.querySelector('.presentation-shell'), { attributes: true, subtree: true, attributeFilter: ['data-state','data-transitioning'] });
  });
  await edge(page, true); await page.mouse.move(400, 400); await page.mouse.wheel(0, 150); await settle(page, 'people');
  check('Real wheel down opens the next screen', await current(page) === 'people');
  await edge(page, false); await page.mouse.wheel(0, -150); await settle(page, 'top');
  const frames = await page.evaluate(() => window.__verticalFrames);
  check('Forward transition enters vertically from below', frames.some(f => f.direction === 'forward' && Math.abs(f.x) < 1 && f.y > 10), frames);
  check('Backward transition enters vertically from above', frames.some(f => f.direction === 'backward' && Math.abs(f.x) < 1 && f.y < -10), frames);
  await page.mouse.wheel(180, 0); await page.waitForTimeout(400);
  check('Horizontal wheel no longer changes scenes', await current(page) === 'top');
  await panel(page).focus(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150);
  check('Horizontal page keyboard navigation removed', await current(page) === 'top');
  await edge(page, true); await page.keyboard.press('ArrowDown'); await settle(page, 'people');
  check('Down arrow turns at the page boundary', await current(page) === 'people');
  await edge(page, false); await panel(page).focus(); await page.keyboard.press('ArrowUp'); await settle(page, 'top');
  check('Up arrow returns at the page boundary', await current(page) === 'top');
  await edge(page, true);
  await page.evaluate(() => { for (let i = 0; i < 8; i++) document.querySelector('.presentation-panel[data-state="active"]').dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })); });
  await settle(page, 'people'); check('One wheel burst turns only one screen', await current(page) === 'people');
  await scene(page, 'profile');
  await page.getByRole('button', { name: '查看个人简历示例画像', exact: true }).click();
  await page.getByRole('button', { name: '预览并确认', exact: true }).click(); await page.getByRole('dialog').waitFor();
  await page.keyboard.press('PageDown'); check('Modal interactions do not turn pages', await current(page) === 'profile');
  await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await scene(page, 'recommendations');
  const card = page.locator('#recommendations [role="group"][tabindex="0"]'); const before = await page.locator('#recommendations h3').first().innerText();
  await card.focus(); await page.keyboard.press('ArrowRight'); await page.waitForFunction(before => document.querySelector('#recommendations h3')?.textContent !== before, before);
  check('Recommendation still handles its own horizontal keys', await current(page) === 'recommendations');
  await scene(page, 'community');
  await page.locator('#community [role="log"]').hover(); await page.mouse.wheel(0, 1000); await page.waitForTimeout(300);
  check('Nested chat keeps its native scroll', await current(page) === 'community');
  await page.getByRole('textbox', { name: '输入演示消息' }).fill('上下翻页也可以继续聊天。'); await page.getByRole('button', { name: '发送演示消息', exact: true }).click();
  check('Chat input and send still work', await page.getByText('上下翻页也可以继续聊天。', { exact: true }).isVisible());
  await scene(page, 'profile'); check('Profile choice survives page changes', await page.getByRole('button', { name: '查看个人简历示例画像', exact: true }).getAttribute('aria-pressed') === 'true');
  await page.goBack(); await settle(page, 'community'); check('Browser Back retains vertical scene navigation', await current(page) === 'community');
  await page.getByRole('button', { name: '暂停页面动画', exact: true }).click();
  await edge(page, true); await page.mouse.move(80, 400); await page.mouse.wheel(0, 150); await settle(page, 'invitation');
  check('Paused page navigation works without animation', await panel(page).evaluate(e => getComputedStyle(e).animationName === 'none'));
  for (const width of [1440,1024,768,390,320]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 }); await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const dimensions = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, stageBottom: document.querySelector('.presentation-stage').getBoundingClientRect().bottom, height: innerHeight }));
    results.widths.push(dimensions); check('Stage extends to viewport bottom at ' + width, dimensions.width === dimensions.document && Math.abs(dimensions.stageBottom - dimensions.height) < 1, dimensions);
    for (const id of ['top','profile','invitation']) { await scene(page,id); if (width === 1440 || width === 390) await page.screenshot({ path: 'docs/screenshots/v6/' + width + '-' + id + '.png', animations: 'disabled' }); }
  }
  const context = await browser.newContext({ viewport: { width:390,height:844 }, isMobile:true, hasTouch:true, reducedMotion:'reduce' });
  const mobile = await context.newPage(); mobile.on('pageerror', e => results.errors.push(e.message)); await mobile.goto(base, {waitUntil:'networkidle'}); await mobile.waitForFunction(() => document.documentElement.dataset.motion === 'paused');
  const cdp = await context.newCDPSession(mobile);
  const swipe = async (x1,y1,x2,y2) => { await cdp.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x:x1,y:y1}]}); for(let i=1;i<=5;i++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x1+(x2-x1)*i/5,y:y1+(y2-y1)*i/5}]}); await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); };
  await edge(mobile,true); await swipe(195,610,195,360); await settle(mobile,'people'); check('Real mobile upward swipe opens next screen',await current(mobile)==='people');
  await edge(mobile,false); await swipe(195,240,195,500); await settle(mobile,'top'); check('Real mobile downward swipe returns to previous screen',await current(mobile)==='top');
  await swipe(300,230,90,230); await mobile.waitForTimeout(200); check('Horizontal swipe no longer turns the page',await current(mobile)==='top');
  await scene(mobile,'profile'); await edge(mobile,false); await swipe(180,600,180,340); await mobile.waitForTimeout(350);
  check('Long mobile content scrolls before page turn',await current(mobile)==='profile'&&await panel(mobile).evaluate(e=>e.scrollTop>0));
  await edge(mobile,true); await swipe(370,610,370,350); await settle(mobile,'recommendations'); check('Mobile flips after reaching the content bottom',await current(mobile)==='recommendations');
  await edge(mobile,false); await swipe(190,190,190,470); await settle(mobile,'profile');
  check('Returning upward lands at previous content bottom',await panel(mobile).evaluate(e=>Math.abs(e.scrollHeight-e.clientHeight-e.scrollTop)<4));
  await scene(mobile,'community'); await edge(mobile,true); const log=mobile.locator('#community [role="log"]'); await log.scrollIntoViewIfNeeded(); const box=await log.boundingBox();
  await swipe(box.x+box.width/2,box.y+box.height*.75,box.x+box.width/2,box.y+box.height*.25); await mobile.waitForTimeout(200); check('Touching chat scrolls the chat, not the page',await current(mobile)==='community');
  await context.close(); check('No runtime errors',results.errors.length===0,results.errors); results.passed=true;
} catch(error) { results.passed=false;results.failure=error.stack;console.error(error.stack); }
finally { writeFileSync('docs/v6-verification.json',JSON.stringify(results,null,2)); await browser.close(); }
if(!results.passed)process.exit(1);
