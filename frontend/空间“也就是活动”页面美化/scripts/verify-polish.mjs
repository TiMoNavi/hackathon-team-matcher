import {createRequire} from 'node:module';
import {mkdirSync, writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='http://127.0.0.1:4201';
const result={date:'2026-11-12',checks:[],errors:[],consoleErrors:[],screenshots:[]};
const check=(name,passed)=>{result.checks.push({name,passed});console.log((passed?'PASS ':'FAIL ')+name);if(!passed)throw Error(name)};
mkdirSync('.cache/polish-browser',{recursive:true});mkdirSync('docs/screenshots/polish',{recursive:true});
const context=await chromium.launchPersistentContext(process.cwd()+'/.cache/polish-browser',{headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE,viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const page=await context.newPage();page.setDefaultTimeout(10000);
page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')result.consoleErrors.push(m.text())});
const screenshot=async(name,fullPage=false)=>{const path='docs/screenshots/polish/'+name+'.png';await page.screenshot({path,fullPage,animations:'disabled'});result.screenshots.push(path)};
const card=()=>page.getByTestId('post-p1');
const profile=()=>page.locator('.member-popover');
const dismissProfile=async()=>{await profile().getByRole('button',{name:'关闭资料卡',exact:true}).click();await profile().waitFor({state:'hidden'})};
const closeThread=async()=>{await page.getByRole('button',{name:'关闭弹窗',exact:true}).click();await page.locator('.event-dialog').waitFor({state:'hidden'})};
const openThread=async()=>{await card().getByRole('button',{name:'查看林小满的帖子',exact:true}).click()};
const fits=async(locator)=>locator.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight+1&&el.scrollWidth<=el.clientWidth+1});
try{
  await page.goto(base,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
  await screenshot('1440-overview',true);
  await page.locator('.avatar-stack .member-avatar').first().click();
  check('Hero avatar opens the correct basic profile',await profile().getByRole('heading',{name:'林小满',exact:true}).isVisible());
  check('Basic profile includes role, skills and activity intention',(await profile().innerText()).includes('React')&&(await profile().innerText()).includes('想认识对 AI 产品感兴趣的搭档'));
  check('Profile popover fits desktop viewport',await fits(profile()));await screenshot('1440-avatar-card');
  const [profilePage]=await Promise.all([context.waitForEvent('page'),profile().getByRole('link',{name:/查看个人主页/}).click()]);
  await profilePage.waitForLoadState('networkidle');
  check('Profile entry opens a real matching person route',profilePage.url()===base+'/people/1'&&await profilePage.getByRole('heading',{name:'林小满',exact:true}).isVisible());
  check('Original activity stays open with profile entry',await page.locator('#event-name').isVisible() && new URL(page.url()).pathname==='/');
  await profilePage.screenshot({path:'docs/screenshots/polish/1440-personal-page.png',fullPage:true});
  await profilePage.getByRole('link',{name:'返回活动',exact:true}).click();check('Profile return entry reaches activity forum',await profilePage.getByRole('tab',{name:'论坛',exact:true}).getAttribute('aria-selected')==='true');await profilePage.close();await dismissProfile();
  await card().locator('.post-header .member-avatar').focus();await page.keyboard.press('Enter');
  check('Author avatar is keyboard operable',await profile().isVisible());await page.keyboard.press('Escape');await profile().waitFor({state:'hidden'});await page.waitForFunction(()=>document.activeElement?.matches('.post-header .member-avatar'));
  check('Escape restores focus to author avatar',await card().locator('.post-header .member-avatar').evaluate(el=>el===document.activeElement));
  await openThread();await page.getByTestId('reply-c1').locator('.member-avatar').click();
  check('Reply avatar resolves explicit author identity',await profile().getByRole('heading',{name:'陈序',exact:true}).isVisible());await page.keyboard.press('Escape');await profile().waitFor({state:'hidden'});
  check('Escape closes nested profile without closing thread',await profile().count()===0&&await page.locator('.event-dialog').isVisible());
  await page.getByRole('button',{name:'回复陈序的第1条讨论',exact:true}).click();
  check('Reply action sets quote context and focuses composer',await page.locator('.replying-to').isVisible()&&await page.getByLabel('写下你的回复',{exact:true}).evaluate(el=>document.activeElement===el));
  await page.getByLabel('写下你的回复',{exact:true}).fill('我们一起从最小版本开始吧。');await closeThread();await openThread();
  check('Reply text and target survive closing the thread',await page.getByLabel('写下你的回复',{exact:true}).inputValue()==='我们一起从最小版本开始吧。'&&await page.locator('.replying-to').innerText().then(t=>t.includes('陈序')));
  await page.getByRole('button',{name:'发送演示回复',exact:true}).click();
  check('Quoted reply renders with correct original context',await page.locator('.own-reply .reply-quote').innerText().then(t=>t.includes('陈序')&&t.includes('路线推荐')));
  check('Successful reply clears composer and quote selection',await page.getByLabel('写下你的回复',{exact:true}).inputValue()===''&&await page.locator('.replying-to').count()===0);
  await screenshot('1440-replies');
  await page.getByRole('button',{name:'发送演示回复',exact:true}).click();check('Empty replies remain validated',await page.getByRole('alert').innerText()==='先写下你的回复。');
  await page.getByRole('button',{name:'回复许知夏的第2条讨论',exact:true}).click();await page.getByRole('button',{name:'取消引用回复',exact:true}).click();check('Quote can be cancelled independently',await page.locator('.replying-to').count()===0);
  await closeThread();check('Forum card previews the latest submitted reply',await card().locator('.reply-preview-message').innerText()==='我们一起从最小版本开始吧。');
  await card().locator('.post-reply-preview .member-avatar').click();check('New local reply avatar opens self identity',await profile().getByRole('heading',{name:'我',exact:true}).isVisible());await dismissProfile();
  await page.getByRole('button',{name:'预览设置',exact:true}).click();await page.getByRole('button',{name:'归档只读',exact:true}).click();await openThread();
  check('Archive keeps reply read-only',await page.getByRole('button',{name:'回复陈序的第1条讨论',exact:true}).isDisabled()&&await page.getByLabel('写下你的回复',{exact:true}).isDisabled());
  await page.getByTestId('reply-c1').locator('.member-avatar').click();check('Archived profile remains readable',await profile().getByRole('heading',{name:'陈序',exact:true}).isVisible());await dismissProfile();await closeThread();
  await page.goto(base,{waitUntil:'networkidle'});
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
    await page.locator('.avatar-stack .member-avatar').nth(2).click();check('Avatar card fits '+width+'px touch layout',await fits(profile()));if(width===390)await screenshot('390-avatar-card');await dismissProfile();
    await openThread();await page.getByTestId('reply-c2').locator('.member-avatar').click();check('Nested reply profile fits '+width+'px layout',await fits(profile()));await dismissProfile();
    check('Reply dialog fits '+width+'px layout',await fits(page.locator('.event-dialog')));
    check('Reply textarea avoids iOS focus zoom '+width,await page.getByLabel('写下你的回复',{exact:true}).evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16));
    if(width===390)await screenshot('390-replies');await closeThread();
    await page.goto(base+'/people/3',{waitUntil:'networkidle'});check('Matching personal page fits '+width+'px layout',await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth));
    if(width===390)await screenshot('390-personal-page',true);await page.goto(base,{waitUntil:'networkidle'});
  }
  for(const [id,name]of [[0,'我'],[1,'林小满'],[2,'陈序'],[3,'许知夏'],[4,'周一舟'],[5,'唐可'],[6,'宋言']]){
    const response=await context.request.get(base+'/people/'+id);check('Personal route '+id+' matches '+name,response.status()===200&&(await response.text()).includes(name));
  }
  const missing=await context.request.get(base+'/people/999301');const missingBody=await missing.text();check('Unknown person shows not-found without member data', [200,404].includes(missing.status())&&missingBody.includes('暂时找不到这位伙伴')&&missingBody.includes('noindex')&&!missingBody.includes('profile-identity-body'));result.notFoundStatus=missing.status();
  check('No runtime errors from profile or reply flows',result.errors.length===0);check('No browser console errors',result.consoleErrors.length===0);result.passed=true;
}catch(e){result.passed=false;result.failure=e.stack;console.error(e.stack);await screenshot('failure').catch(()=>{})}
finally{writeFileSync('docs/polish-verification.json',JSON.stringify(result,null,2));await context.close()}
if(!result.passed)process.exit(1);
