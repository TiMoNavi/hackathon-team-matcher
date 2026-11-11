import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.PREVIEW_URL||'http://127.0.0.1:4201/';
const result={date:'2026-11-12',base,checks:[],errors:[],consoleErrors:[],httpErrors:[],widths:[],fonts:[]};
const check=(name,passed,detail)=>{result.checks.push({name,passed,...(detail?{detail}:{} )});console.log((passed?'PASS ':'FAIL ')+name);if(!passed)throw Error(name+' '+JSON.stringify(detail))};
mkdirSync('.cache/verify-browser',{recursive:true});
mkdirSync('docs/screenshots/final',{recursive:true});
const context=await chromium.launchPersistentContext(process.cwd()+'/.cache/verify-browser',{headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE,viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const page=await context.newPage();page.setDefaultTimeout(12000);
page.on('pageerror',e=>result.errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')result.consoleErrors.push({text:m.text(),location:m.location()})});
page.on('response',r=>{if(r.status()>=400)result.httpErrors.push({url:r.url(),status:r.status()})});
const close=async()=>{await page.getByRole('button',{name:'关闭弹窗',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'})};
const tab=async(name)=>{await page.getByRole('tab',{name,exact:true}).click();await page.waitForTimeout(80)};
const settings=async()=>{await page.getByRole('button',{name:'预览设置',exact:true}).click()};
try{
 await page.goto(base,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
 check('Activity title and four tabs present',(await page.locator('h1').innerText()).includes('周末造物场')&&await page.getByRole('tab').count()===4);
 check('Local images fully loaded',await page.locator('img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0)));
 const cdp=await context.newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');
 for(const selector of ['.brand-en','.event-edition','.hero-copy h1','.hero-intro']){const {root}=await cdp.send('DOM.getDocument');const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector});const f=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});result.fonts.push({selector,fonts:f.fonts})}
 check('Bricolage actually rendered',result.fonts[0].fonts.some(f=>f.familyName.includes('Bricolage')));
 check('Inter actually rendered',result.fonts[1].fonts.some(f=>f.familyName.includes('Inter')));
 check('Chinese glyph font checked',result.fonts[2].fonts.some(f=>f.glyphCount>0&&f.familyName.includes('PingFang')),result.fonts[2]);
 await page.getByRole('button',{name:'查看风采照片：好点子，围坐着就发生了',exact:true}).click();
 check('Photo dialog opens',await page.getByRole('dialog').isVisible());await page.keyboard.press('ArrowRight');
 check('Photo keyboard next works',await page.getByRole('dialog').getByText('从陌生，到一起开工',{exact:true}).count()>0);
 await page.keyboard.press('ArrowLeft');await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});await page.waitForFunction(()=>document.activeElement?.classList.contains('photo-cover'));
 check('Photo Escape closes and restores focus',await page.getByRole('button',{name:'查看风采照片：好点子，围坐着就发生了',exact:true}).evaluate(el=>document.activeElement===el));
 const card=page.getByTestId('post-p1');await card.getByRole('button',{name:'点赞 8',exact:true}).click();
 check('Like updates both state and count',await card.getByRole('button',{name:'取消点赞 9',exact:true}).getAttribute('aria-pressed')==='true');
 await card.getByRole('button',{name:'查看林小满的帖子',exact:true}).click();
 await page.getByLabel('写下你的回复',{exact:true}).fill('一起试试一个最小版本吧。');await page.getByRole('button',{name:'发送演示回复',exact:true}).click();
 check('Local reply appended to thread',await page.getByRole('dialog').getByText('一起试试一个最小版本吧。',{exact:true}).count()===1);await close();
 await page.getByRole('button',{name:'发个帖子',exact:true}).click();await page.getByRole('button',{name:'发布演示帖子',exact:true}).click();
 check('Empty post validation appears',await page.getByRole('alert').innerText()==='写一点想分享的内容吧。');
 await page.getByLabel('你的想法',{exact:true}).fill('想做一个让开发者互相帮助的小工具。');await close();
 await page.getByRole('button',{name:'发个帖子',exact:true}).click();check('Draft survives closing the composer',await page.getByLabel('你的想法',{exact:true}).inputValue()==='想做一个让开发者互相帮助的小工具。');
 await page.getByLabel('这次想聊什么',{exact:true}).selectOption('找队友');await page.getByRole('button',{name:'发布演示帖子',exact:true}).click();
 check('Published demo is visible in activity forum',await page.getByRole('tabpanel',{name:'活动论坛',exact:true}).getByText('想做一个让开发者互相帮助的小工具。',{exact:true}).count()===1);
 await page.getByRole('button',{name:'项目进展',exact:true}).click();check('Forum category filter works',await page.locator('#panel-forum .forum-card').count()===1);
 await page.getByRole('button',{name:'全部',exact:true}).click();await page.getByLabel('搜索本场活动的讨论',{exact:true}).fill('不存在的主题XYZ');
 check('Search empty result shown',await page.getByText('还没有找到这条讨论',{exact:true}).count()===1);await page.getByRole('button',{name:'清除筛选',exact:true}).click();
 await tab('日程');check('Day one agenda has five sessions',await page.locator('#panel-schedule .agenda-item').count()===5);
 await page.getByRole('button',{name:'Day 2 11 月 15 日 打磨与分享',exact:true}).click();check('Day two agenda has three sessions',await page.locator('#panel-schedule .agenda-item').count()===3);
 await page.getByTestId('schedule-s7').click();check('Schedule details include correct full date',(await page.getByRole('dialog').innerText()).includes('2026 年 11 月 15 日'));
 await page.getByRole('button',{name:'标记参加这项日程',exact:true}).click();check('Schedule participation toggle works',await page.getByRole('button',{name:'已标记参加 · 点击取消',exact:true}).count()===1);await close();
 check('Participation reflected in agenda',await page.getByTestId('schedule-s7').getByText('已标记参加',{exact:true}).count()===1);
 await tab('风采');check('All gallery photos accessible',await page.locator('.gallery-card').count()===5);
 await page.getByRole('tab',{name:'风采',exact:true}).focus();await page.keyboard.press('ArrowLeft');check('Tabs support arrow keyboard navigation',await page.getByRole('tab',{name:'日程',exact:true}).getAttribute('aria-selected')==='true');
 await tab('论坛');await tab('日程');await page.goBack();check('Browser back restores activity section',await page.getByRole('tab',{name:'论坛',exact:true}).getAttribute('aria-selected')==='true');
 await page.getByRole('button',{name:'发现',exact:true}).click();await page.getByLabel('筛选同场伙伴',{exact:true}).fill('Python');check('People filter uses current activity demo',await page.locator('.person-card').count()===1);await close();
 await settings();await page.getByRole('button',{name:'归档只读',exact:true}).click();await page.getByRole('button',{name:'发个帖子',exact:true}).scrollIntoViewIfNeeded();check('Archived activity disables posting',await page.getByRole('button',{name:'发个帖子',exact:true}).isDisabled());
 await settings();await page.getByRole('button',{name:'资格失效',exact:true}).click();check('Lost access clears member content DOM',await page.locator('.forum-card,.hero-gallery,.person-card,.agenda-item').count()===0);
 await settings();await page.getByRole('button',{name:'收到邀请',exact:true}).click();check('Invitation does not expose activity content',await page.locator('.forum-card,.hero-gallery').count()===0);await page.getByRole('button',{name:'接受邀请',exact:true}).click();check('Accept demo invitation restores activity shell',await page.locator('.hero-gallery').count()===1);
 await settings();await page.getByRole('button',{name:'空内容预览 关闭',exact:true}).click();check('Empty forum and photo state shown',await page.getByText('第一段对话，等你开启',{exact:true}).count()===1&&await page.getByText('新的故事，即将在这里发生。',{exact:true}).count()===1);
 await tab('日程');check('Empty agenda state shown',await page.getByText('日程还在准备中',{exact:true}).count()===1);
 await settings();await page.getByRole('button',{name:'空内容预览 开启',exact:true}).click();await settings();await page.getByRole('button',{name:'模拟加载失败',exact:true}).click();check('Load error recoverable',await page.getByRole('button',{name:'重新加载',exact:true}).count()===1);await page.getByRole('button',{name:'重新加载',exact:true}).click();
 await page.goto(base,{waitUntil:'networkidle'});
 for(const width of [1440,1024,768,390,320]){
  await page.setViewportSize({width,height:width<600?844:1000});
  for(const [name,id] of [['概览','overview'],['论坛','forum'],['日程','schedule'],['风采','gallery']]){
   await tab(name);await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();window.scrollTo({top:0,behavior:'instant'})});await page.waitForTimeout(80);
   const dimensions=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,tabRects:[...document.querySelectorAll('[role=tab]')].map(e=>({left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})),container:document.querySelector('.activity-content').getBoundingClientRect().width}));
   result.widths.push({width,view:id,...dimensions});check('No overflow and all tabs fit '+width+' '+id,dimensions.document===width&&dimensions.tabRects.every(r=>r.left>=0&&r.right<=width),dimensions);
   if(width===1440||width===390)await page.screenshot({path:'docs/screenshots/final/'+width+'-'+id+'.png',fullPage:true,animations:'disabled'});
  }
 }
 await page.setViewportSize({width:390,height:844});await tab('概览');check('Mobile schedule shortcut appears before forum',await page.locator('.mobile-next-session').isVisible());
 await page.locator('.mobile-next-session').click();check('Mobile schedule shortcut opens session',await page.getByRole('dialog').isVisible());await close();
 await page.getByRole('button',{name:'打开菜单',exact:true}).click();check('Mobile menu works',await page.getByRole('navigation',{name:'手机主导航',exact:true}).isVisible());await page.getByRole('button',{name:'活动广场',exact:true}).click();check('Mobile navigation closes menu',await page.getByRole('navigation',{name:'手机主导航',exact:true}).count()===0);
 await page.getByRole('button',{name:'发个帖子',exact:true}).click();await page.keyboard.press('Tab');check('Dialog focus remains inside',await page.getByRole('dialog').evaluate(el=>el.contains(document.activeElement)));await close();
 await page.getByRole('button',{name:'暂停页面动画',exact:true}).click();check('Pause control updates state',await page.locator('.event-app').getAttribute('data-motion')==='paused');
 check('Reduced motion stops decorative animation',await page.locator('.event-app').evaluate(()=>[...document.querySelectorAll('*')].filter(e=>getComputedStyle(e).animationName!=='none'&&getComputedStyle(e).animationDuration!=='0s').length===0));
 check('No page runtime errors',result.errors.length===0,result.errors);
 check('No console errors',result.consoleErrors.length===0,result.consoleErrors);
 check('No HTTP failures',result.httpErrors.length===0,result.httpErrors);
 result.passed=true;
}catch(e){result.passed=false;result.failure=e.stack;console.error(e.stack);await page.screenshot({path:'docs/screenshots/verification-failure.png',fullPage:true}).catch(()=>{} )}
finally{writeFileSync('docs/verification.json',JSON.stringify(result,null,2));await context.close()}
if(!result.passed)process.exit(1);
