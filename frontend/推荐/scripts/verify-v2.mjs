import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
const base=process.env.PREVIEW_URL||'http://127.0.0.1:4203/';
const dir=resolve('docs/screenshots/v2');mkdirSync(dir,{recursive:true});
const report={version:'V2',date:'2026-11-12',checks:[],errors:[],fonts:{},layouts:[],motion:[]};
function check(name,passed,detail){report.checks.push({name,passed,...(detail!==undefined?{detail}:{})});if(!passed)console.log('FAIL',name,JSON.stringify(detail));}
function watch(page){page.setDefaultTimeout(6500);page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});}
async function ready(page){await page.goto(base,{waitUntil:'networkidle'});await page.locator('.person-avatar img').waitFor({state:'visible'});await page.evaluate(()=>document.fonts.ready);await page.locator('.search-experience').waitFor({state:'hidden'});await page.waitForTimeout(300);}
async function geometry(page){return page.evaluate(()=>{const rect=s=>document.querySelector(s)?.getBoundingClientRect().toJSON();return {size:[innerWidth,innerHeight],scrollWidth:document.documentElement.scrollWidth,stage:rect('.showcase-stage'),controls:rect('.browse-controls'),composer:rect('.composer-dock'),companion:rect('.assistant-companion'),panel:rect('.assistant-panel'),dossier:rect('.profile-dossier'),cue:rect('.scroll-dossier-cue'),cards:[...document.querySelectorAll('.showcase-card')].filter(c=>Number(c.dataset.rank)<2).map(c=>{const h=c.querySelector('h3'),b=c.querySelector('.project-card-bottom');return{rank:c.dataset.rank,title:h.textContent,titleHeight:h.clientHeight,lineHeight:parseFloat(getComputedStyle(h).lineHeight),bodyHeight:c.clientHeight,buttonBottom:b.offsetTop+b.offsetHeight};})};});}
function overlap(a,b){return a&&b&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;}
let videoContext;
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});watch(page);await ready(page);
 const cdp=await page.context().newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const {root}=await cdp.send('DOM.getDocument');
 for(const [name,selector] of [['chinese','h1'],['display','.english-name'],['body','.person-tags > span']]){const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector});report.fonts[name]=(await cdp.send('CSS.getPlatformFontsForNode',{nodeId})).fonts;}
 check('Bricolage Grotesque renders English display',report.fonts.display.some(f=>/Bricolage/.test(f.familyName)&&f.glyphCount>0));
 check('Inter renders English body',report.fonts.body.some(f=>/Inter/.test(f.familyName)&&f.glyphCount>0));
 check('Chinese font actually renders Chinese glyphs',report.fonts.chinese.some(f=>/PingFang|YaHei|Noto Sans CJK/.test(f.familyName)&&f.glyphCount>0));
 for(const [width,height] of [[1920,1080],[1440,900],[1366,768],[1280,720],[1100,900],[1024,768],[768,1024],[390,844],[320,740]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(180);const g=await geometry(page);report.layouts.push(g);
  check('No horizontal overflow '+width,g.scrollWidth===width,g.scrollWidth);
  check('Refresh button contains its content '+width,await page.locator('.refresh-recommendations').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  check('Front titles retain full line height '+width,g.cards.every(c=>c.titleHeight>=c.lineHeight-1),g.cards);
  check('Front actions stay inside cards '+width,g.cards.every(c=>c.buttonBottom<=c.bodyHeight+1),g.cards);
  check('Companion clears composer '+width,!overlap(g.composer,g.companion));
  if(width>=768){check('Controls clear composer '+width,g.controls.bottom+4<=g.composer.top,{controls:g.controls.bottom,composer:g.composer.top});check('Full dossier begins below viewport '+width,g.dossier.top>=height-5,g.dossier.top);}
  if(width>=1100)check('Companion clears controls '+width,!overlap(g.controls,g.companion));
  if([1440,1366,1280,390,320].includes(width))await page.screenshot({path:dir+'/viewport-'+width+'.png'});
  if([1440,1280,1100].includes(width)){
   await page.getByRole('button',{name:'展开 AI 对话侧栏',exact:true}).click();await page.locator('.assistant-panel').waitFor();await page.waitForTimeout(120);const o=await geometry(page);report.layouts.push({state:'sidebar',...o});
   check('Sidebar has reserved width '+width,o.stage.right+8<=o.panel.left&&o.composer.right+8<=o.panel.left,o);
   check('Sidebar preserves title height '+width,o.cards.every(c=>c.titleHeight>=c.lineHeight-1),o.cards);
   check('Sidebar preserves controls above input '+width,o.controls.bottom+4<=o.composer.top,{controls:o.controls.bottom,composer:o.composer.top});
   await page.screenshot({path:dir+'/sidebar-'+width+'.png'});await page.getByRole('button',{name:'关闭 AI 助手',exact:true}).click();
  }
 }
 await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>scrollTo(0,0));
 check('Reduced motion disables autoplay toggle',await page.getByRole('button',{name:'暂停卡片轮换',exact:true}).isDisabled());
 for(const name of ['林小满','许知夏','唐可']){
  await page.getByRole('button',{name:'查看'+name,exact:true}).click();await page.waitForFunction(n=>document.querySelector('.person-name-line h2')?.textContent===n,name);await page.waitForTimeout(120);
  for(let i=0;i<6;i++){await page.locator('.deck-dots button').nth(i).click();await page.waitForTimeout(70);const g=await geometry(page);check(name+' side '+i+' renders readable front cards',g.cards.length===2&&g.cards.every(c=>c.titleHeight>=c.lineHeight-1&&c.buttonBottom<=c.bodyHeight+1),g.cards);}
 }
 await page.getByRole('button',{name:'查看林小满',exact:true}).click();await page.waitForTimeout(100);
 const rear=page.locator('.showcase-card.rank-3');const rearId=await rear.getAttribute('data-item');await rear.locator('.project-label').click();await page.waitForTimeout(100);
 check('Rear label brings that card to foreground',await page.locator('.rank-0').getAttribute('data-item')===rearId);
 const detailButton=page.locator('.rank-0 .project-card-bottom > button');await detailButton.click();
 check('Project detail exposes source and artwork',await page.locator('.detail-dialog .project-art').isVisible()&&(await page.locator('.detail-dialog').innerText()).includes('演示'));
 await page.keyboard.press('Escape');await page.locator('.detail-dialog').waitFor({state:'detached'});
 await page.waitForTimeout(120);check('Detail close restores exact trigger focus',await detailButton.evaluate(e=>e===document.activeElement));
 const tag=page.locator('.hanging-tag').first();const tagText=await tag.innerText();await tag.click();
 check('Hanging plaque opens corresponding detail',(await page.locator('[data-slot=dialog-title]').innerText())===tagText.trim());await page.keyboard.press('Escape');await page.locator('.detail-dialog').waitFor({state:'detached'});
 await page.getByRole('button',{name:'收藏这个人',exact:true}).click();check('Save is locally toggleable',await page.getByRole('button',{name:'取消收藏',exact:true}).getAttribute('aria-pressed')==='true');
 await page.getByRole('button',{name:'下翻，认识完整的 TA',exact:true}).click();await page.waitForTimeout(180);
 check('Profile button scrolls to complete dossier',await page.locator('.profile-dossier').evaluate(el=>el.getBoundingClientRect().top<80));
 check('Dossier contains six portfolio items',await page.locator('.ui-cf__item').count()===6);
 await page.getByRole('button',{name:'下一个作品',exact:true}).click();await page.waitForTimeout(100);check('CoverFlow moves to another work',await page.locator('.ui-cf__item[data-active]').getAttribute('aria-label').then(v=>v.startsWith('2')));
 await page.locator('.ui-cf__item[data-active]').click();check('CoverFlow opens project details',await page.locator('.project-detail-dialog').isVisible());await page.keyboard.press('Escape');
 await page.getByRole('tab',{name:'经历与贡献',exact:true}).click();check('Experience timeline appears',await page.locator('.experience-timeline h3').count()===3);await page.screenshot({path:dir+'/experience.png'});
 await page.getByRole('tab',{name:'作品与想法',exact:true}).click();await page.locator('.portfolio-accordion [data-slot=accordion-trigger]').nth(1).click();check('Project accordion expands',await page.locator('.portfolio-accordion [data-slot=accordion-trigger]').nth(1).getAttribute('aria-expanded')==='true');
 await page.locator('.reading-checklist').scrollIntoViewIfNeeded();const checkbox=page.locator('.reading-checklist [role=checkbox]').first();await checkbox.click();check('Reading checklist tracks local progress',await checkbox.getAttribute('aria-checked')==='true');
 const noticeTitle=await page.locator('.conversation-notes [data-depth="0"] h3').innerText();await page.locator('.conversation-notes [data-depth="0"] .ui-ns__close').click();await page.waitForTimeout(400);check('Notification stack reveals next question',await page.locator('.conversation-notes [data-depth="0"] h3').innerText()!==noticeTitle);
 await page.locator('.profile-findings .ui-afc__agent').first().click();check('AI evidence filter narrows to one category',await page.locator('.profile-findings .ui-afc__slot').count()===1);await page.locator('.profile-findings .ui-afc__agent').first().click();
 await page.locator('.collaboration-plan').scrollIntoViewIfNeeded();
 const planToggle=page.locator('.collaboration-plan .ui-pcc__toggle');if(await planToggle.getAttribute('aria-expanded')==='false')await planToggle.click();
 const task=page.locator('.collaboration-plan [role=checkbox]').first();await task.click();check('Collaboration task checklist is interactive',await task.getAttribute('aria-checked')==='true');
 await page.locator('.collaboration-plan .ui-pcc__status').click();await page.getByRole('radio',{name:'准备试试',exact:true}).click();check('Collaboration status can change',(await page.locator('.collaboration-plan .ui-pcc__status').innerText()).includes('准备试试'));
 await page.locator('.collaboration-plan').screenshot({path:dir+'/collaboration-plan.png'});
 await page.locator('.profile-dossier').scrollIntoViewIfNeeded();await page.screenshot({path:dir+'/dossier-full.png',fullPage:true});
 await page.evaluate(()=>scrollTo(0,0));await page.locator('#ai-prompt').fill('想找一位设计伙伴，一起做原型');await page.getByRole('button',{name:'发送演示需求',exact:true}).click();
 check('Composer opens conversation sidebar',await page.locator('.assistant-panel').isVisible());check('Assistant shows a thinking phase',await page.locator('.chat-messages .ui-tlc').isVisible());await page.locator('.chat-message.assistant').waitFor();
 check('Local reply follows submitted prompt',(await page.locator('.chat-message.assistant').innerText()).includes('许知夏'));
 await page.getByRole('button',{name:'看看知夏',exact:true}).click();await page.waitForTimeout(100);check('Assistant action switches person',await page.locator('.person-name-line h2').innerText()==='许知夏');check('Conversation persists across person switch',await page.locator('.chat-message').count()===2);
 await page.getByRole('button',{name:'把协作节奏带到前排',exact:true}).click();check('Assistant brings availability card forward',await page.locator('.rank-0').getAttribute('data-item')==='time');
 await page.screenshot({path:dir+'/conversation-desktop.png'});await page.getByRole('button',{name:'关闭 AI 助手',exact:true}).click();await page.waitForTimeout(100);
 await page.getByRole('button',{name:'和右下角 AI 助手聊聊',exact:true}).click();check('Corner companion opens sidebar',await page.locator('.assistant-panel').isVisible());await page.getByRole('button',{name:'关闭 AI 助手',exact:true}).click();
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'展开 AI 对话侧栏',exact:true}).click();
 check('Mobile sidebar is modal',await page.locator('.assistant-panel').getAttribute('aria-modal')==='true');check('Mobile sidebar focuses own input',await page.locator('#panel-prompt').evaluate(el=>el===document.activeElement));check('Mobile composer yields to modal input',await page.locator('.composer-dock').evaluate(el=>getComputedStyle(el).visibility==='hidden'));
 await page.screenshot({path:dir+'/conversation-mobile.png'});await page.keyboard.press('Escape');await page.locator('.assistant-panel').waitFor({state:'detached'});check('Mobile escape returns focus to edge handle',await page.locator('.ai-edge-handle').evaluate(el=>el===document.activeElement));
 await page.close();
 videoContext=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:resolve('docs/videos/v2'),size:{width:1440,height:900}}});
 const animated=await videoContext.newPage();watch(animated);await ready(animated);await animated.mouse.move(0,0);
 await animated.getByRole('button',{name:'AI 重新搜索',exact:true}).click();check('Refresh starts AI progress',await animated.locator('.search-experience').isVisible());check('Duplicate refresh is disabled',await animated.locator('.refresh-recommendations').isDisabled());
 const phases=[];for(let i=0;i<6;i++){phases.push(Number(await animated.locator('.search-progress-track').getAttribute('aria-valuenow')));if(i===2)await animated.screenshot({path:dir+'/ai-search.png'});await animated.waitForTimeout(420);}
 check('AI progress advances through distinct stages',new Set(phases).size>=3,phases);await animated.locator('.search-experience').waitFor({state:'hidden'});await animated.waitForTimeout(800);
 await animated.getByRole('button',{name:'AI 重新搜索',exact:true}).click();await animated.getByRole('button',{name:'跳过演示，直接查看',exact:true}).click();await animated.locator('.search-experience').waitFor({state:'hidden'});check('Search can be skipped',await animated.locator('.refresh-recommendations').isEnabled());await animated.mouse.move(0,0);await animated.evaluate(()=>document.activeElement?.blur());
 await animated.waitForTimeout(1000);const originalIndex=await animated.locator('.showcase-board').getAttribute('data-index');const pos1=await animated.locator('.rank-0').boundingBox();await animated.waitForTimeout(500);const pos2=await animated.locator('.rank-0').boundingBox();
 check('Cards rest between transitions',Math.abs(pos1.x-pos2.x)<.5&&Math.abs(pos1.y-pos2.y)<.5,{pos1,pos2});await animated.waitForFunction(i=>document.querySelector('.showcase-board')?.dataset.index!==i,originalIndex,{timeout:7000});check('Right cards automatically rotate',true);await animated.waitForTimeout(900);
 const hoverIndex=await animated.locator('.showcase-board').getAttribute('data-index');await animated.locator('.rank-0 .project-copy').hover();await animated.waitForTimeout(5800);check('Hover pauses reading cycle',await animated.locator('.showcase-board').getAttribute('data-index')===hoverIndex);
 await animated.mouse.move(0,0);await animated.locator('#ai-prompt').fill('慢慢看一下作品');const typingIndex=await animated.locator('.showcase-board').getAttribute('data-index');await animated.waitForTimeout(5800);check('Typing pauses rotation',await animated.locator('.showcase-board').getAttribute('data-index')===typingIndex);await animated.locator('#ai-prompt').fill('');await animated.evaluate(()=>document.activeElement?.blur());
 await animated.getByRole('button',{name:'暂停页面动效',exact:true}).click();check('Global motion switch pauses page',await animated.locator('html').getAttribute('data-motion')==='paused');await animated.waitForTimeout(100);check('Paused text remains readable',await animated.locator('.companion-bubble .ui-trv__p').first().evaluate(el=>getComputedStyle(el).opacity==='1'));
 await animated.getByRole('button',{name:'展开 AI 对话侧栏',exact:true}).click();await animated.waitForTimeout(100);check('Sidebar remains visible with global motion paused',await animated.locator('.assistant-panel').evaluate(el=>getComputedStyle(el).opacity==='1'));await animated.getByRole('button',{name:'关闭 AI 助手',exact:true}).click();
 await animated.getByRole('button',{name:'开启页面动效',exact:true}).click();await animated.mouse.move(0,0);const beforeRear=await animated.locator('.rank-2').getAttribute('data-item');await animated.locator('.rank-2 .project-label').click();await animated.waitForTimeout(150);await animated.screenshot({path:dir+'/card-transition.png'});await animated.waitForTimeout(800);check('Animated rear selection settles on requested card',await animated.locator('.rank-0').getAttribute('data-item')===beforeRear);
 await animated.screenshot({path:dir+'/desktop-motion-settled.png'});const videoPath=await animated.video().path();await animated.close();await videoContext.close();videoContext=null;renameSync(videoPath,resolve('docs/videos/v2/recommendation-v2.webm'));report.video='docs/videos/v2/recommendation-v2.webm';
 check('No browser runtime or hydration errors',report.errors.length===0,report.errors);
}catch(error){report.fatal=String(error.stack||error);console.error(report.fatal);}
finally{if(videoContext)await videoContext.close();await browser.close();report.passed=report.checks.filter(c=>c.passed).length;report.failed=report.checks.filter(c=>!c.passed).length;writeFileSync('docs/verification-v2.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,failed:report.failed,errors:report.errors.length,fatal:report.fatal}));if(report.failed||report.errors.length||report.fatal)process.exitCode=1;}
