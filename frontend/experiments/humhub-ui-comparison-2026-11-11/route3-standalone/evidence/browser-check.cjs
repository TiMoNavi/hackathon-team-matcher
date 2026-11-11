const { chromium } = require('/Users/550m/code/hackathon-team-matcher/backend/.runtime/browser/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

(async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true, timeout: 20000, args: ['--disable-gpu'] });
  const results = { at: new Date().toISOString(), url: 'http://127.0.0.1:3193', checks: [], pages: [] };
  try {
    for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
      const page = await browser.newPage({viewport, deviceScaleFactor:1, reducedMotion:'reduce'});
      const errors = []; const failedRequests = []; const externalRequests = []; const responses = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {if(message.type() === 'error') errors.push(message.text());});
      page.on('requestfailed', request => failedRequests.push({url:request.url(),failure:request.failure()}));
      page.on('request', request => {if(!request.url().startsWith('http://127.0.0.1:3193/')) externalRequests.push(request.url());});
      page.on('response', response => {if(response.status() >= 400) responses.push({url:response.url(),status:response.status()});});
      await page.goto(results.url, {waitUntil:'networkidle'});
      await page.waitForFunction(() => document.querySelectorAll('[data-testid=member-card]').length === 4);
      const suffix = viewport.width === 1440 ? 'desktop' : 'mobile';
      await page.screenshot({path:path.join(__dirname,suffix+'.png'),fullPage:true});
      await page.screenshot({path:path.join(__dirname,suffix+'-viewport.png'),fullPage:false});
      const layout = await page.evaluate(() => ({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
      assert.ok(layout.document <= viewport.width, 'horizontal document overflow');
      assert.ok(layout.body <= viewport.width, 'horizontal body overflow');
      assert.equal(await page.getByTestId('member-card').count(),4);
      await page.locator('[data-role-filter="前端"]').click();
      assert.equal(await page.getByTestId('member-card').count(),1);
      assert.equal(await page.getByTestId('member-card').getAttribute('data-member-id'),'lin');
      await page.locator('[data-role-filter="全部"]').click();
      await page.getByTestId('member-search').fill('Figma');
      assert.equal(await page.getByTestId('member-card').count(),1);
      assert.equal(await page.getByTestId('member-card').getAttribute('data-member-id'),'xu');
      await page.getByTestId('member-search').fill('陈予安');
      assert.equal(await page.getByTestId('member-card').count(),1);
      assert.equal(await page.getByTestId('member-card').getAttribute('data-member-id'),'chen');
      await page.getByTestId('member-search').fill('not-a-member');
      assert.equal(await page.getByTestId('member-card').count(),0);
      assert.ok(await page.getByRole('button',{name:'清除筛选'}).isVisible());
      await page.getByRole('button',{name:'清除筛选'}).click();
      assert.equal(await page.getByTestId('member-card').count(),4);
      const follow = page.getByTestId('member-follow-lin');
      await follow.click();
      assert.equal(await follow.getAttribute('aria-pressed'),'true');
      assert.ok((await follow.textContent()).includes('已关注'));
      await follow.click();
      assert.equal(await follow.getAttribute('aria-pressed'),'false');
      await page.getByTestId('member-details-lin').click();
      assert.ok(await page.getByRole('dialog').isVisible());
      assert.ok((await page.getByRole('dialog').textContent()).includes('林舟'));
      await page.screenshot({path:path.join(__dirname,suffix+'-dialog.png'),fullPage:false});
      await page.getByRole('button',{name:'关闭详情',exact:true}).click();
      assert.equal(await page.getByRole('dialog').count(),0);
      await page.getByTestId('member-details-lin').click();
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('dialog').count(),0);
      const sourceComponents = {kitCards:await page.locator('[data-slot=card]').count(),affectProgress:await page.locator('.ui-progress').count()};
      assert.equal(sourceComponents.kitCards,7);
      assert.equal(sourceComponents.affectProgress,1);
      if(viewport.width === 1440) {
        await page.getByRole('checkbox',{name:'认识一位新搭档'}).click();
        assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'),'2');
        results.checks.push('AffectUI progress interaction');
      }
      const assets = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => ({name:entry.name,transferSize:entry.transferSize,encodedBodySize:entry.encodedBodySize,decodedBodySize:entry.decodedBodySize})));
      results.pages.push({viewport,layout,sourceComponents,errors,failedRequests,externalRequests,responses,assets});
      assert.deepEqual(errors,[], 'browser errors');
      assert.deepEqual(failedRequests,[], 'failed requests');
      assert.deepEqual(externalRequests,[], 'external requests');
      assert.deepEqual(responses,[], 'HTTP errors');
      results.checks.push(suffix+': initial cards, role filter, skill/name search, empty state, follow toggle, detail close/Escape, no overflow, no browser/network errors');
      await page.close();
    }
    results.passed = true;
  } catch (error) {
    results.passed = false; results.error = String(error.stack || error); throw error;
  } finally {
    fs.writeFileSync(path.join(__dirname,'browser-results.json'),JSON.stringify(results,null,2));
    console.log(JSON.stringify({passed:results.passed,checks:results.checks,pages:results.pages.map(({viewport,layout,errors})=>({viewport,layout,errors}))},null,2));
    await browser.close();
  }
})();
