const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '../../../backend/.runtime/browser/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:4202';
const report = { checks: [], errors: [], overflow: [] };
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark', reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
    await page.goto(origin, { waitUntil: 'networkidle' });
    const isDark = () => page.locator('html').evaluate(el => el.classList.contains('dark'));
    const scheme = () => page.locator('html').evaluate(el => getComputedStyle(el).colorScheme);
    assert.equal(await isDark(), false);
    assert.equal(await scheme(), 'light');
    assert(await page.getByRole('button', {name:'切换至夜间模式'}).isEnabled());
    report.checks.push('系统为夜间且无历史选择时，默认仍为日间模式');
    await page.getByLabel('输入消息', { exact: true }).fill('切换主题时保留草稿');
    await page.getByRole('button', {name:'切换至夜间模式'}).click();
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
    assert.equal(await scheme(), 'dark');
    assert.equal(await page.getByLabel('输入消息', { exact: true }).inputValue(), '切换主题时保留草稿');
    assert.equal(await page.evaluate(() => localStorage.getItem('team-matcher-chat-theme')), 'dark');
    report.checks.push('切换到夜间并保留当前会话与草稿');
    await page.getByLabel('输入消息', { exact: true }).fill('');
    const shots = path.resolve(__dirname, '../docs/screenshots');
    await page.screenshot({path:path.join(shots,'night-group-1440.png'),fullPage:true});
    await page.getByRole('button',{name:'查看群聊详情'}).click();
    assert.equal(await page.locator('.details-drawer').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(33, 27, 47)');
    await page.screenshot({path:path.join(shots,'night-details-1440.png'),fullPage:true});
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'新建会话',exact:true}).click();
    assert.equal(await page.locator('.new-dialog').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(33, 27, 47)');
    await page.screenshot({path:path.join(shots,'night-new-dialog-1440.png'),fullPage:true});
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'插入表情'}).click();
    assert.equal(await page.locator('.emoji-picker').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(33, 27, 47)');
    await page.keyboard.press('Escape');
    report.checks.push('夜间主题覆盖门户抽屉、新建会话弹窗及表情浮层');
    await page.reload({waitUntil:'networkidle'});
    assert(await isDark());
    await page.goto(origin+'/direct',{waitUntil:'networkidle'});
    assert(await isDark());
    await page.getByRole('button',{name:'切换至日间模式'}).focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.documentElement.classList.contains('light'));
    await page.reload({waitUntil:'networkidle'});
    assert.equal(await isDark(),false);
    report.checks.push('刷新和切换路由保留手动选择，键盘可切回日间');
    for(const width of [320,390,768,1024,1440]) {
      await page.setViewportSize({width,height:844});
      await page.goto(origin,{waitUntil:'networkidle'});
      for (const mode of ['light','dark']) {
        if(mode==='dark') { await page.getByRole('button',{name:'切换至夜间模式'}).click(); await page.waitForFunction(()=>document.documentElement.classList.contains('dark')); }
        const geometry = await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,button:document.querySelector('.theme-toggle').getBoundingClientRect().toJSON()}));
        report.overflow.push({mode,...geometry});
        assert(geometry.scrollWidth<=width); assert(geometry.button.x>=0 && geometry.button.right<=width);
        if(width===390) await page.screenshot({path:path.join(shots,mode+'-list-390.png'),fullPage:true});
      }
      await page.getByTestId('chat-weekend').click();
      if(width===390) await page.screenshot({path:path.join(shots,'night-group-390.png'),fullPage:true});
      await page.getByRole('button',{name:'切换至日间模式'}).click();
      await page.waitForFunction(()=>document.documentElement.classList.contains('light'));
    }
    report.checks.push('320/390/768/1024/1440px 两种主题无横向溢出，切换按钮均可见');
    assert.deepEqual(report.errors,[]);
    report.checks.push('无控制台错误、Hydration 错误或运行时异常');
    fs.writeFileSync(path.resolve(__dirname,'../docs/theme-verification.json'),JSON.stringify(report,null,2)+String.fromCharCode(10));
    console.log(JSON.stringify(report,null,2));
  } finally { await browser.close(); }
})().catch(error=>{ console.error(error); process.exitCode=1; });
