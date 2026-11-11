import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=path.resolve('docs/screenshots/v2');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const page=await context.newPage();const errors=[],requests=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:')&&!r.url().startsWith('data:'))requests.push(r.url());});
const geometry=()=>{
 const bars=[...document.querySelectorAll('.message-strip')];
 const items=bars.map(el=>{const rect=el.getBoundingClientRect();const text=el.querySelector('.message-value');const tr=text.getBoundingClientRect();return{id:el.dataset.entry,rect:rect.toJSON(),clip:getComputedStyle(el).clipPath,phase:el.dataset.phase,text:el.innerText,textOverflow:text.scrollHeight>text.clientHeight+2,outside:tr.top<rect.top-1||tr.bottom>rect.bottom+1}});
 const collisions=[];items.forEach((a,i)=>items.slice(i+1).forEach(b=>{if(Math.min(a.rect.right,b.rect.right)>Math.max(a.rect.left,b.rect.left)+1&&Math.min(a.rect.bottom,b.rect.bottom)>Math.max(a.rect.top,b.rect.top)+1)collisions.push([a.id,b.id]);}));
 const duplicates=[...document.querySelectorAll('[id]')].map(e=>e.id).filter((id,i,all)=>all.indexOf(id)!==i);
 return{width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,collisions,duplicates,items};
};
const validate=(s,label,{long=false}={})=>{assert.equal(s.overflow,false,label+' page overflow');assert.deepEqual(s.collisions,[],label+' overlapping strips');assert.deepEqual(s.duplicates,[],label+' duplicate IDs');assert.ok(s.items.every(x=>!x.outside),label+' text escapes strips');if(!long)assert.ok(s.items.every(x=>!x.textOverflow),label+' unintended text truncation');};
const close=async()=>{await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});};
const top=async()=>{await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'});});await page.mouse.move(1435,4);};
try{
 await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:4213/',{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
 await page.getByRole('button',{name:'暂停页面动效',exact:true}).click();await top();
 for(const [width,height] of [[1440,1000],[1100,950],[1024,950],[901,950],[768,1024],[390,844],[320,800]]){
  await page.setViewportSize({width,height});await top();await page.waitForTimeout(150);
  const state=await page.evaluate(geometry);validate(state,String(width));assert.equal(state.items.length,8);
  checks.push({viewport:width,bars:state.items.length,overflow:state.overflow,collisions:state.collisions});
  if([1440,768,390,320].includes(width)){await page.screenshot({path:path.join(out,width+'-hero.png')});await page.screenshot({path:path.join(out,width+'-full.png'),fullPage:true});}
 }
 await page.setViewportSize({width:1440,height:1000});await top();
 const first=page.locator('.message-strip').first();await first.click();await page.getByRole('dialog').waitFor();await close();assert.equal(await first.evaluate(el=>document.activeElement===el),true);
 const ids=await page.locator('.message-strip').evaluateAll(els=>els.map(e=>e.dataset.entry));await page.getByRole('button',{name:'换一组',exact:true}).click();const next=await page.locator('.message-strip').evaluateAll(els=>els.map(e=>e.dataset.entry));assert.notDeepEqual(ids,next);validate(await page.evaluate(geometry),'manual next');checks.push({entryDetails:true,focusRestoration:true,manualRotation:true});
 // Every citation points to a currently visible fixture and opens a real detail.
 const citation=page.locator('.ui-cac__marker').first();await citation.click();await page.getByRole('button',{name:'查看资料条目',exact:true}).click();await page.getByRole('dialog').waitFor();assert.match(await page.getByRole('dialog').innerText(),/交互设计/);await close();await page.getByRole('button',{name:'收起依据',exact:true}).click();
 await page.locator('#viewer-context').selectOption('designer');assert.match(await page.locator('.insights-main h3').innerText(),/共同/);assert.match(await page.locator('.ui-cac__text').innerText(),/全栈/);
 await page.locator('#viewer-context').selectOption('guest');assert.match(await page.locator('.match-points').innerText(),/缺少你的目标/);
 await page.locator('#viewer-context').selectOption('developer');await page.getByRole('button',{name:'用这句打招呼',exact:true}).click();assert.match(await page.locator('#hello-message').inputValue(),/全栈开发/);await page.getByRole('button',{name:'保存这句开场白'}).click();assert.equal(await page.getByRole('button',{name:'已保存开场白'}).isDisabled(),true);await close();checks.push({citationPreviewAndDetail:true,viewerContexts:3,localDraft:true});
 await page.getByRole('button',{name:'收藏漫游地图',exact:true}).click();assert.equal(await page.getByRole('button',{name:'取消收藏漫游地图',exact:true}).getAttribute('aria-pressed'),'true');await page.getByRole('button',{name:'展开想法：漫游地图'}).click();await page.getByRole('dialog').waitFor();await close();
 await page.getByRole('button',{name:/过去参加/}).click();assert.equal(await page.locator('.activity-record').count(),2);await page.getByRole('button',{name:'查看活动：AI × Design 共创日'}).click();await page.getByRole('dialog').waitFor();assert.match(await page.getByRole('dialog').innerText(),/历史布局预览/);await close();await page.getByRole('button',{name:'正在参加',exact:true}).click();assert.equal(await page.locator('.activity-record').count(),1);checks.push({ideaDetails:true,bookmark:true,activityFilterCounts:[1,2],historyLabel:true});
 await page.locator('.preview-settings summary').click();
 for(const scenario of ['sparse','long','no-photo']){
  await page.locator('#scenario').selectOption(scenario);
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});await top();validate(await page.evaluate(geometry),scenario+' '+width,{long:scenario==='long'});}
  if(scenario==='sparse'){assert.equal(await page.locator('.message-strip').count(),2);assert.equal(await page.locator('.activity-record').count(),0);assert.equal(await page.locator('.idea-card').count(),0);assert.match(await page.locator('.insights-main').innerText(),/资料还少/);assert.equal(await page.locator('.ui-cac__marker').count(),1);assert.equal(await page.locator('.conversation-starter').count(),0);}
  if(scenario==='no-photo'){assert.equal(await page.locator('.portrait-fallback').count(),1);assert.equal(await page.locator('.portrait-card img').count(),0);}
  await page.screenshot({path:path.join(out,'320-'+scenario+'.png'),fullPage:true});
 }
 checks.push({contentStates:['sparse','long','no-photo'],stateWidths:[1440,390,320]});
 await page.locator('#scenario').selectOption('full');await page.setViewportSize({width:390,height:844});await top();await page.getByRole('button',{name:'打开导航',exact:true}).click();await page.getByRole('navigation',{name:'手机章节导航'}).getByRole('link',{name:'AI 合作参考'}).click();assert.equal(await page.locator('#mobile-nav').count(),0);await page.locator('.ui-cac__marker').first().click();await page.getByRole('button',{name:'查看资料条目',exact:true}).click();await page.getByRole('dialog').waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,'390-evidence.png')});await close();checks.push({mobileNavigation:true,mobileEvidenceDialog:true});
 await page.setViewportSize({width:1440,height:1000});await top();await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'系统已减少动态效果'}).waitFor();assert.equal(await page.getByRole('button',{name:'系统已减少动态效果'}).isDisabled(),true);assert.equal(await first.evaluate(el=>el.getAnimations().length),0);const reducedIds=await page.locator('.message-strip').evaluateAll(els=>els.map(e=>e.dataset.entry));await page.waitForTimeout(1200);assert.deepEqual(await page.locator('.message-strip').evaluateAll(els=>els.map(e=>e.dataset.entry)),reducedIds);checks.push({reducedMotion:true});await page.emulateMedia({reducedMotion:'no-preference'});
 const cdp=await context.newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const {root:dom}=await cdp.send('DOM.getDocument');const fonts={};
 for(const selector of ['.world-heading h1','.message-value','.hero-breadcrumb','.portrait-copy p']){const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:dom.nodeId,selector});fonts[selector]=(await cdp.send('CSS.getPlatformFontsForNode',{nodeId})).fonts;}
 assert.ok(fonts['.portrait-copy p'].some(f=>/Bricolage/i.test(f.familyName)&&f.isCustomFont),'Bricolage actually renders');assert.ok(fonts['.hero-breadcrumb'].some(f=>/Inter/i.test(f.familyName)&&f.isCustomFont),'Inter actually renders');assert.ok(fonts['.world-heading h1'].some(f=>/PingFang/i.test(f.familyName)),'Chinese actual platform font');checks.push({platformFonts:fonts});
 // Observe the real animation for >4 cycles. No seek/time mocking in coverage.
 await page.getByRole('button',{name:'播放页面动效',exact:true}).click();await top();await page.waitForFunction(()=>document.querySelector('.facts-field').dataset.paused==='false');
 const seen=new Set(),phases=new Set(),clips=new Set();const frames=[];
 for(let i=0;i<122;i++){await page.waitForTimeout(500);const s=await page.evaluate(geometry);validate(s,'motion '+i);s.items.forEach(x=>{seen.add(x.id);phases.add(x.phase);clips.add(x.clip);});frames.push({t:i*.5,items:s.items.map(x=>({id:x.id,phase:x.phase,clip:x.clip}))});if(i===17)await page.screenshot({path:path.join(out,'1440-motion.png')});}
 assert.ok(seen.size>=27,'all 27 pool entries rotate');for(const phase of ['growing','holding','retracting','hidden'])assert.ok(phases.has(phase),'phase '+phase);assert.ok(clips.size>25,'visible progressive reveal');
 const box=await first.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.waitForFunction(()=>document.querySelector('.facts-field').dataset.paused==='true'&&document.querySelector('.message-strip').getAnimations().every(a=>a.playState==='paused'&&!a.pending));const times=await page.locator('.message-strip').evaluateAll(els=>els.map(e=>e.getAnimations()[0]?.currentTime));await page.waitForTimeout(700);assert.deepEqual(await page.locator('.message-strip').evaluateAll(els=>els.map(e=>e.getAnimations()[0]?.currentTime)),times);
 await page.mouse.move(1435,4);await first.focus();assert.equal(await page.locator('.facts-field').getAttribute('data-paused'),'true');await first.click();await page.getByRole('dialog').waitFor();assert.equal(await page.locator('.facts-field').getAttribute('data-paused'),'true');await close();await page.evaluate(()=>document.activeElement?.blur());await page.locator('#activities').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('.facts-field').dataset.paused==='true');
 checks.push({motionSeconds:61,uniqueEntries:seen.size,phases:[...phases],clipStates:clips.size,hoverPause:true,focusPause:true,dialogPause:true,offscreenPause:true});
 await writeFile('docs/v2-motion-frames.json',JSON.stringify(frames,null,2));
 assert.deepEqual(errors,[],'runtime errors');assert.deepEqual(requests,[],'external requests');
 await writeFile('docs/v2-verification.json',JSON.stringify({status:'passed',checks,errors,externalRequests:requests},null,2));console.log(JSON.stringify({status:'passed',checks,errors},null,2));
}catch(error){await writeFile('docs/v2-verification.json',JSON.stringify({status:'failed',error:String(error),checks,errors},null,2));console.error(error);await page.screenshot({path:path.join(out,'verification-failure.png'),fullPage:true});process.exitCode=1;}
finally{await browser.close();}
