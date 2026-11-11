const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '../../../backend/.runtime/browser/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:4202';
const screenshots = path.join(root,'docs/screenshots/polish-v2');
fs.mkdirSync(screenshots,{recursive:true});
const report = {checks:[],errors:[],layout:[]};
(async()=>{
  const browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'no-preference',colorScheme:'dark'});
    page.on('pageerror',e=>report.errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
    await page.goto(origin,{waitUntil:'networkidle'});
    assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('dark')),false);
    const wash=page.locator('.atmosphere-wash');
    const transform=()=>wash.evaluate(el=>getComputedStyle(el).transform);
    const before=await transform();await page.waitForTimeout(180);assert.notEqual(await transform(),before);
    await page.getByRole('button',{name:'暂停背景动效'}).click();
    await page.waitForFunction(()=>document.documentElement.dataset.chatMotion==='paused');
    assert.equal(await wash.evaluate(el=>getComputedStyle(el).animationPlayState),'paused');
    const paused=await transform();await page.waitForTimeout(180);assert.equal(await transform(),paused);
    await page.getByLabel('输入消息',{exact:true}).fill('暂停模式下仍能发送');await page.getByRole('button',{name:'发送',exact:true}).click();
    assert.equal(await page.locator('.message-row').last().evaluate(el=>getComputedStyle(el).animationName),'none');
    report.checks.push('无历史偏好默认日间；背景真实移动，暂停后位置保持；暂停不影响发送且新消息无入场动画');
    await page.getByRole('button',{name:'播放背景动效'}).click();
    await page.getByLabel('输入消息',{exact:true}).fill('新的消息，轻轻出现');await page.getByRole('button',{name:'发送',exact:true}).click();
    assert.equal(await page.locator('.message-row').last().evaluate(el=>getComputedStyle(el).animationName),'message-arrive');
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await wash.evaluate(el=>getComputedStyle(el).animationName),'none');
    assert.equal(await page.locator('.message-row').last().evaluate(el=>getComputedStyle(el).animationName),'none');
    report.checks.push('新发送消息有轻量反馈，系统减少动态效果时背景及新消息动画停用');
    const shot=async name=>{await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(screenshots,name+'.png'),fullPage:true});};
    await page.goto(origin,{waitUntil:'networkidle'});
    await shot('desktop-day');
    await page.getByRole('button',{name:/^查看好友申请/}).click();await shot('requests-day');await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'切换至夜间模式'}).click();await page.waitForFunction(()=>document.documentElement.classList.contains('dark'));
    await shot('desktop-night');
    await page.getByRole('button',{name:/^查看好友申请/}).click();await shot('requests-night');await page.keyboard.press('Escape');
    await page.getByTestId('chat-lin').click();await shot('direct-night');
    for(const [width,height] of [[1024,768],[768,900],[390,844],[320,568],[390,420]]){
      await page.setViewportSize({width,height});
      for(const mode of ['light','dark']){
        await page.goto(origin,{waitUntil:'networkidle'});
        const dark=await page.locator('html').evaluate(el=>el.classList.contains('dark'));
        if((mode==='dark')!==dark){await page.getByRole('button',{name:mode==='dark'?'切换至夜间模式':'切换至日间模式'}).click();await page.waitForFunction(m=>document.documentElement.classList.contains(m),mode);}
        if(width===390 && height===844)await shot('list-'+mode+'-390');
        await page.getByTestId('chat-weekend').click();
        const g=await page.evaluate(()=>{const rect=document.querySelector('.message-composer').getBoundingClientRect();return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,composerBottom:rect.bottom,messageViewport:document.querySelector('.message-viewport').clientHeight};});
        report.layout.push({mode,...g});assert(g.scrollWidth<=width);assert(g.composerBottom<=height);assert(g.messageViewport>20);
        if(width===390 && height===844)await shot('group-'+mode+'-390');
        if(width<1024)await page.getByRole('button',{name:'返回会话列表'}).click();
        await page.getByRole('button',{name:/^查看好友申请/}).click();
        const drawer=page.locator('.friend-requests-drawer');
        const rect=await drawer.boundingBox();assert(rect.x>=0&&rect.x+rect.width<=width);
        await drawer.getByRole('button',{name:'接受孟晚的好友申请'}).scrollIntoViewIfNeeded();
        if(width===390 && height===844){await drawer.locator('[data-slot=scroll-area-viewport]').evaluate(el=>el.scrollTop=0);await shot('requests-'+mode+'-390');}
        await page.keyboard.press('Escape');
      }
    }
    report.checks.push('1024/768/390/320px 及 390×420 短屏，两种主题无横向溢出，输入区可用，申请可滚动到底');
    assert.deepEqual(report.errors,[]);
    report.checks.push('截图覆盖桌面/手机/好友侧栏，未发现控制台或运行时异常');
    fs.writeFileSync(path.join(root,'docs/polish-verification.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
