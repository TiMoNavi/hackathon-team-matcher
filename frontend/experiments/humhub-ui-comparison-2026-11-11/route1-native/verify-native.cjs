const fs = require('fs');
const path = require('path');
const { chromium } = require('/Users/550m/code/hackathon-team-matcher/backend/.runtime/browser/node_modules/playwright');
const outputDir = __dirname;
const origin = process.env.COMPARISON_ORIGIN || 'http://localhost:8193';
const url = origin + '/comparison-native/home/index';
const checks = [];
function check(name, condition, detail) {
  checks.push({ name, passed: Boolean(condition), detail });
  if (!condition) throw new Error(name + ': ' + JSON.stringify(detail));
}
(async () => {
  const browser = await chromium.launch({executablePath:'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',headless:true,timeout:20000,args:['--disable-gpu']});
  const context = await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  const page = await context.newPage();
  const errors = [], failedRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => failedRequests.push({url:request.url(),error:request.failure()?.errorText}));
  try {
    const response = await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
    check('HTTP 200', response.status() === 200, response.status());
    const html = await response.text();
    check('PHP server-rendered member cards', html.includes('data-member-id="lin"') && html.includes('data-member-id="zhou"'), 'Fixture markup present in initial HTTP response');
    await page.locator('#native-comparison[data-ready="true"]').waitFor();
    await page.waitForTimeout(500);
    const desktop = await page.evaluate(() => ({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,resources:performance.getEntriesByType('resource').map(r=>({name:r.name,initiatorType:r.initiatorType,transferSize:r.transferSize,encodedBodySize:r.encodedBodySize,decodedBodySize:r.decodedBodySize})),scripts:[...document.scripts].map(s=>s.src).filter(Boolean),stylesheets:[...document.querySelectorAll('link[rel="stylesheet"]')].map(s=>s.href),hasJquery:typeof window.jQuery === 'function',hasBootstrap:typeof window.bootstrap !== 'undefined'}));
    check('Desktop no horizontal overflow', desktop.scrollWidth <= desktop.width, desktop.scrollWidth);
    const cards=page.locator('[data-testid="member-card"]:visible');
    check('Four initial members', await cards.count() === 4, await cards.count());
    await page.screenshot({path:path.join(outputDir,'desktop.png'),fullPage:true});
    for (const role of ['前端','后端','设计','产品']) {
      await page.locator('[data-role-filter="'+role+'"]').click();
      check('Role filter '+role,await cards.count() === 1,await cards.count());
    }
    await page.locator('[data-role-filter="全部"]').click();
    const search=page.getByTestId('member-search');
    await search.fill('林舟');
    check('Name search', await cards.count()===1 && await cards.first().getAttribute('data-member-id')==='lin',await cards.count());
    await search.fill('react');
    check('Case insensitive skill search',await cards.count()===1 && await cards.first().getAttribute('data-member-id')==='lin',await cards.count());
    await search.fill('does-not-exist');
    check('Empty state',await cards.count()===0 && await page.locator('[data-empty]').isVisible(),await cards.count());
    await page.locator('[data-reset]').click();
    check('Reset filters',await cards.count()===4,await cards.count());
    await page.getByTestId('member-details-lin').click();
    const dialog=page.getByRole('dialog');
    check('Member dialog',await dialog.isVisible() && (await dialog.innerText()).includes('林舟'),await dialog.isVisible());
    await page.keyboard.press('Escape');
    check('Escape closes dialog',!(await dialog.isVisible()),await dialog.isVisible());
    await page.getByTestId('member-details-lin').click();
    await page.getByRole('button',{name:'关闭详情',exact:true}).click();
    check('Close button closes dialog',!(await dialog.isVisible()),await dialog.isVisible());
    const follow=page.getByTestId('member-follow-lin');
    await follow.click();
    check('Follow toggles on',await follow.getAttribute('aria-pressed')==='true',await follow.getAttribute('aria-pressed'));
    await follow.click();
    check('Follow toggles off',await follow.getAttribute('aria-pressed')==='false',await follow.getAttribute('aria-pressed'));
    check('Two ideas',await page.locator('.cn-idea-card').count()===2,await page.locator('.cn-idea-card').count());
    check('Synthetic disclaimer visible',await page.getByText('交互演示 · 非真实成员数据',{exact:false}).isVisible(),true);
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>scrollTo(0,0));
    await page.waitForTimeout(150);
    const mobile=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight}));
    check('Mobile no horizontal overflow',mobile.scrollWidth<=mobile.width,mobile.scrollWidth);
    check('Mobile navigation visible',await page.locator('.cn-mobile-nav').isVisible(),await page.locator('.cn-mobile-nav').isVisible());
    await page.locator('[data-toast]').waitFor({state:'hidden'});
    await page.screenshot({path:path.join(outputDir,'mobile.png'),fullPage:true});
    await page.getByTestId('member-details-lin').click();
    const box=await dialog.boundingBox();
    check('Mobile dialog fits viewport',box && box.x>=0 && box.x+box.width<=390,box);
    await page.keyboard.press('Escape');
    check('No browser JS errors',errors.length===0,errors);
    const result={tested_at:new Date().toISOString(),url,checks,desktop,mobile,errors,failedRequests};
    fs.writeFileSync(path.join(outputDir,'browser-results.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify({passed:checks.filter(c=>c.passed).length,checks:checks.length,desktop:{width:desktop.width,scrollWidth:desktop.scrollWidth},mobile,errors,failedRequests,stylesheets:desktop.stylesheets,scripts:desktop.scripts},null,2));
  } catch(error) {
    fs.writeFileSync(path.join(outputDir,'browser-failure.json'),JSON.stringify({time:new Date().toISOString(),message:error.message,checks,errors,failedRequests},null,2));
    throw error;
  } finally { await browser.close(); }
})();
