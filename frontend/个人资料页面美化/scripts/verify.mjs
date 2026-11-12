import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=path.resolve('docs/screenshots/v3');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const page=await context.newPage();const errors=[],requests=[],httpErrors=[],checks=[],payloadReads=[],forbidden=['小岛工作室','认真倾听','乐于试验'];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:')&&!r.url().startsWith('data:'))requests.push(r.url());});
page.on('response',r=>{if(r.status()>=400)httpErrors.push({url:r.url(),status:r.status()});if(['document','script'].includes(r.request().resourceType()))payloadReads.push(r.text().then(t=>forbidden.filter(s=>t.includes(s))).catch(()=>[]));});
const report=checks.push.bind(checks);checks.push=(...items)=>{console.log('Checked:',items.map(item=>Object.keys(item)[0]).join(', '));return report(...items);};
const geometry=()=>{
 const bars=[...document.querySelectorAll('.message-strip')];
 const items=bars.map(el=>{const rect=el.getBoundingClientRect();const text=el.querySelector('.message-value');const tr=text.getBoundingClientRect();return{id:el.dataset.entry,rect:rect.toJSON(),clip:getComputedStyle(el).clipPath,phase:el.dataset.phase,text:el.innerText,textOverflow:text.scrollHeight>text.clientHeight+2,outside:tr.top<rect.top-1||tr.bottom>rect.bottom+1}});
 const collisions=[];items.forEach((a,i)=>items.slice(i+1).forEach(b=>{if(Math.min(a.rect.right,b.rect.right)>Math.max(a.rect.left,b.rect.left)+1&&Math.min(a.rect.bottom,b.rect.bottom)>Math.max(a.rect.top,b.rect.top)+1)collisions.push([a.id,b.id]);}));
 const duplicates=[...document.querySelectorAll('[id]')].map(e=>e.id).filter((id,i,all)=>all.indexOf(id)!==i);
 const clippedRows=[...document.querySelectorAll('.detail-list-row dd,.work-card-body,.connection-action,.friend-request-draft')].filter(e=>e.clientWidth&&e.scrollWidth>e.clientWidth+2).map(e=>e.className);
 return{width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,collisions,duplicates,clippedRows,items};
};
const validate=(s,label,{long=false}={})=>{assert.equal(s.overflow,false,label+' page overflow');assert.deepEqual(s.collisions,[],label+' overlapping strips');assert.deepEqual(s.duplicates,[],label+' duplicate IDs');assert.deepEqual(s.clippedRows,[],label+' clipped detail/work content');assert.ok(s.items.every(x=>!x.outside),label+' text escapes strips');if(!long)assert.ok(s.items.every(x=>!x.textOverflow),label+' unintended strip text truncation');};
const close=async()=>{await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});};
const top=async()=>{await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'});});await page.mouse.move((await page.viewportSize()).width-5,4);};
const screenshot=async name=>{await page.waitForTimeout(450);await page.screenshot({path:path.join(out,name+'.png')});};
const openRequest=async()=>{await page.locator('.header-contact').click();await page.getByRole('dialog').waitFor();};
const draftText=()=>page.locator('.request-editable-text');
const editor=()=>page.getByRole('textbox',{name:'好友申请正文'});
const setScenario=async value=>{await page.locator('.preview-settings').evaluate(el=>el.open=true);await page.locator('#scenario').selectOption(value);};
try{
 await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:4213/',{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
 await page.getByRole('button',{name:'暂停页面动效',exact:true}).click();await top();
 const order=await page.locator('main section[id]').evaluateAll(els=>els.map(e=>e.id));assert.deepEqual(order,['about','insights','details','work','activities','connect']);checks.push({visitorOrder:order});
 for(const [width,height] of [[1440,1000],[1100,950],[1024,950],[901,950],[768,1024],[390,844],[320,800]]){
  await page.setViewportSize({width,height});await top();await page.waitForTimeout(200);
  const state=await page.evaluate(geometry);validate(state,String(width));assert.equal(state.items.length,8);
  checks.push({viewport:width,bars:state.items.length,overflow:state.overflow,clippedRows:state.clippedRows});
  if([1440,768,390,320].includes(width)){await screenshot(width+'-hero');await page.screenshot({path:path.join(out,width+'-full.png'),fullPage:true});}
 }
 await page.setViewportSize({width:1440,height:1000});await top();
 const first=page.locator('.message-strip').first();await first.click();await page.getByRole('dialog').waitFor();await close();assert.equal(await first.evaluate(el=>document.activeElement===el),true);
 const ids=await page.locator('.message-strip').evaluateAll(els=>els.map(e=>e.dataset.entry));await page.getByRole('button',{name:'换一组',exact:true}).click();const next=await page.locator('.message-strip').evaluateAll(els=>els.map(e=>e.dataset.entry));assert.notDeepEqual(ids,next);validate(await page.evaluate(geometry),'manual next');checks.push({entryDetails:true,focusRestoration:true,manualRotation:true});
 // Real accordion keyboard behavior and label/value rows, including every visible field.
 const basic=page.getByRole('button',{name:/基本信息与方向 身份/});await basic.focus();await page.keyboard.press('Enter');assert.equal(await basic.getAttribute('aria-expanded'),'true');
 const event=page.getByRole('button',{name:/本次活动投入 周末/});await event.click();assert.equal(await page.locator('.detail-list-row[data-field]').count(),27);
 assert.equal(await page.locator('.restricted-row').count(),2);assert.equal(await page.locator('.privacy-placeholder[aria-hidden="true"]').count(),2);assert.deepEqual(await page.locator('.privacy-placeholder').allTextContents(),['','']);assert.equal(await page.locator('.restricted-row button').count(),0);
 await page.locator('#entry-skill-design button').click();await page.getByRole('dialog').waitFor();assert.match(await page.getByRole('dialog').innerText(),/本人自评/);await close();
 const expandedRows=await page.locator('.detail-list-row[data-field]').evaluateAll(els=>els.map(e=>({id:e.id,field:e.dataset.field})));await basic.click();await event.click();checks.push({detailsFieldRows:expandedRows.length,projectRecords:2,accordionKeyboard:true,restrictedPlaceholders:2,restrictedTextAbsent:true});
 // Both application entry points share one editable local draft.
 await top();await openRequest();assert.match(await draftText().innerText(),/我做全栈开发/);await screenshot('1440-request');
 await page.getByRole('button',{name:'简短一点',exact:true}).click();const short=await draftText().innerText();assert.match(short,/方便加个好友/);assert.equal(await page.getByRole('button',{name:'简短一点',exact:true}).getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:'具体一点',exact:true}).click();assert.match(await draftText().innerText(),/重点讨论/);
 await page.getByRole('button',{name:'编辑申请',exact:true}).click();const manual='你好，知夏！我想聊聊地图服务的接入方案，可以加个好友吗？';await editor().fill(manual);
 await page.getByRole('button',{name:'保存申请草稿',exact:true}).click();await page.locator('.friend-request-draft[data-phase="saved"]').waitFor();assert.match(await page.locator('.ui-edc__receipt').innerText(),/没有发送，也没有建立好友关系/);await screenshot('1440-request-saved');await close();
 await page.locator('#connect').getByRole('button',{name:'继续编辑好友申请',exact:true}).click();await page.getByRole('dialog').waitFor();assert.equal(await draftText().innerText(),manual);
 await page.getByRole('button',{name:'编辑申请',exact:true}).click();await editor().fill('测'.repeat(301));assert.equal((await editor().inputValue()).length,300);await editor().fill('');assert.equal(await page.getByRole('button',{name:'保存申请草稿',exact:true}).isDisabled(),true);
 await editor().fill(manual);await editor().press('Escape');await page.waitForTimeout(300);assert.equal(await page.getByRole('dialog').isVisible(),true);assert.equal(await editor().count(),0);
 await page.getByRole('button',{name:'放下草稿',exact:true}).click();await page.locator('.friend-request-draft[data-phase="discarded"]').waitFor();await page.getByRole('button',{name:'恢复草稿',exact:true}).click();assert.equal(await draftText().innerText(),manual);
 await page.getByRole('button',{name:'编辑申请',exact:true}).click();await editor().press('Control+Enter');await page.locator('.friend-request-draft[data-phase="saved"]').waitFor();await close();
 assert.equal(await page.locator('.privacy-lock').count(),2);checks.push({sharedTopBottomDraft:true,toneChoices:3,manualEdit:true,maxLength:300,emptySaveDisabled:true,discardRestore:true,keyboardSave:true,escapeEditor:true,noFriendUnlock:true});
 // Viewer changes reset a draft derived from a previous simulated account.
 await page.locator('#viewer-context').selectOption('designer');assert.match(await page.locator('.insights-main h3').innerText(),/共同/);await openRequest();assert.match(await draftText().innerText(),/我也做产品设计/);assert.ok(!(await draftText().innerText()).includes(manual));await close();
 await page.locator('#viewer-context').selectOption('guest');assert.match(await page.locator('.match-points').innerText(),/缺少你的目标/);await page.locator('#viewer-context').selectOption('developer');
 const citation=page.locator('.ui-cac__marker').first();await citation.click();await page.getByRole('button',{name:'查看资料条目',exact:true}).click();await page.getByRole('dialog').waitFor();assert.match(await page.getByRole('dialog').innerText(),/交互设计/);await close();await page.getByRole('button',{name:'收起依据',exact:true}).click();checks.push({citationPreviewAndDetail:true,viewerContexts:3,visitorDraftReset:true});
 assert.equal(await page.locator('.work-card').count(),4);await page.getByRole('tab',{name:/^想法/}).click();assert.equal(await page.locator('.work-card').count(),2);await page.getByRole('tab',{name:/^项目/}).click();assert.equal(await page.locator('.work-card').count(),2);await page.getByRole('button',{name:'看项目贡献',exact:true}).first().click();await page.getByRole('dialog').waitFor();assert.match(await page.getByRole('dialog').innerText(),/前端原型/);await close();
 await page.getByRole('tab',{name:/^全部/}).click();await page.getByRole('button',{name:'收藏参与的想法：漫游地图',exact:true}).click();assert.equal(await page.getByRole('button',{name:'取消收藏参与的想法：漫游地图',exact:true}).getAttribute('aria-pressed'),'true');await page.getByRole('button',{name:'看这个想法',exact:true}).first().click();await page.getByRole('dialog').waitFor();await close();
 await page.getByRole('button',{name:/过去参加/}).click();assert.equal(await page.locator('.activity-record').count(),2);await page.getByRole('button',{name:'查看活动：AI × Design 共创日'}).click();await page.getByRole('dialog').waitFor();assert.match(await page.getByRole('dialog').innerText(),/历史布局预览/);await close();await page.getByRole('button',{name:'正在参加',exact:true}).click();assert.equal(await page.locator('.activity-record').count(),1);checks.push({workTabsCounts:[4,2,2],workDetails:true,bookmark:true,activityCounts:[1,2],historyLabel:true});
 for(const scenario of ['sparse','long','no-photo']){
  await setScenario(scenario);
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});await top();validate(await page.evaluate(geometry),scenario+' '+width,{long:scenario==='long'});}
  if(scenario==='sparse'){assert.equal(await page.locator('.message-strip').count(),2);assert.equal(await page.locator('.activity-record').count(),0);assert.equal(await page.locator('.work-card').count(),0);assert.equal(await page.locator('.restricted-row').count(),0);assert.match(await page.locator('.insights-main').innerText(),/资料还少/);assert.equal(await page.locator('.ui-cac__marker').count(),1);assert.equal(await page.locator('.conversation-starter').count(),0);
   await page.setViewportSize({width:1440,height:1000});await openRequest();assert.ok(!(await draftText().innerText()).includes('漫游地图'));assert.match(await draftText().innerText(),/交互设计/);await close();await page.setViewportSize({width:320,height:900});
  }
  if(scenario==='no-photo'){assert.equal(await page.locator('.portrait-fallback').count(),1);assert.equal(await page.locator('.portrait-card img,.connection-avatar img,[data-slot="avatar-image"]').count(),0);}
  await top();await page.screenshot({path:path.join(out,'320-'+scenario+'.png'),fullPage:true});
 }
 checks.push({contentStates:['sparse','long','no-photo'],stateWidths:[1440,390,320],visibilityDraftReset:true});
 await setScenario('full');await page.setViewportSize({width:390,height:844});await top();await page.getByRole('button',{name:'打开导航',exact:true}).click();await page.getByRole('navigation',{name:'手机章节导航'}).getByRole('link',{name:'AI 推荐'}).click();assert.equal(await page.locator('#mobile-nav').count(),0);
 await page.locator('#connect').getByRole('button',{name:/用自己的话/}).click();await page.getByRole('dialog').waitFor();assert.equal(await editor().inputValue(),'');await editor().fill('你好！想认识你。');await editor().press('Escape');await page.getByRole('button',{name:'自然一点',exact:true}).click();validate(await page.evaluate(geometry),'mobile request');await screenshot('390-request');
 await page.setViewportSize({width:320,height:800});validate(await page.evaluate(geometry),'320 request');await screenshot('320-request');await page.getByRole('button',{name:'保存申请草稿',exact:true}).click();await screenshot('320-request-saved');await close();checks.push({manualEntry:true,mobileNavigation:true,mobileRequest:true});
 await page.setViewportSize({width:1440,height:1000});await top();await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'系统已减少动态效果'}).waitFor();assert.equal(await page.getByRole('button',{name:'系统已减少动态效果'}).isDisabled(),true);assert.equal(await first.evaluate(el=>el.getAnimations().length),0);const reducedIds=await page.locator('.message-strip').evaluateAll(els=>els.map(e=>e.dataset.entry));await page.waitForTimeout(1200);assert.deepEqual(await page.locator('.message-strip').evaluateAll(els=>els.map(e=>e.dataset.entry)),reducedIds);checks.push({reducedMotion:true});await page.emulateMedia({reducedMotion:'no-preference'});
 const cdp=await context.newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const {root:dom}=await cdp.send('DOM.getDocument');const fonts={};
 for(const selector of ['.world-heading h1','.message-value','.hero-breadcrumb','.portrait-copy p','#details-title','.detail-list-row dt']){const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:dom.nodeId,selector});fonts[selector]=(await cdp.send('CSS.getPlatformFontsForNode',{nodeId})).fonts;}
 assert.ok(fonts['.portrait-copy p'].some(f=>/Bricolage/i.test(f.familyName)&&f.isCustomFont),'Bricolage actually renders');assert.ok(fonts['.hero-breadcrumb'].some(f=>/Inter/i.test(f.familyName)&&f.isCustomFont),'Inter actually renders');assert.ok(fonts['.world-heading h1'].some(f=>/PingFang/i.test(f.familyName)),'Chinese actual platform font');checks.push({platformFonts:fonts});
 // Observe the real animation for >4 cycles. No seek/time mocking in coverage.
 await page.getByRole('button',{name:'播放页面动效',exact:true}).click();await top();await page.waitForFunction(()=>document.querySelector('.facts-field').dataset.paused==='false');
 const seen=new Set(),phases=new Set(),clips=new Set();const frames=[];
 for(let i=0;i<122;i++){await page.waitForTimeout(500);const s=await page.evaluate(geometry);validate(s,'motion '+i);s.items.forEach(x=>{seen.add(x.id);phases.add(x.phase);clips.add(x.clip);});frames.push({t:i*.5,items:s.items.map(x=>({id:x.id,phase:x.phase,clip:x.clip}))});if(i===17)await page.screenshot({path:path.join(out,'1440-motion.png')});}
 assert.ok(seen.size>=25,'all 25 pool entries rotate');for(const phase of ['growing','holding','retracting','hidden'])assert.ok(phases.has(phase),'phase '+phase);assert.ok(clips.size>25,'visible progressive reveal');
 const box=await first.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.waitForFunction(()=>document.querySelector('.facts-field').dataset.paused==='true'&&[...document.querySelectorAll('.message-strip')].every(el=>el.getAnimations().filter(a=>a.effect.getTiming().iterations===Infinity).every(a=>a.playState==='paused'&&!a.pending)));const times=await page.locator('.message-strip').evaluateAll(els=>els.map(e=>e.getAnimations().find(a=>a.effect.getTiming().iterations===Infinity)?.currentTime));await page.waitForTimeout(700);assert.deepEqual(await page.locator('.message-strip').evaluateAll(els=>els.map(e=>e.getAnimations().find(a=>a.effect.getTiming().iterations===Infinity)?.currentTime)),times);
 await page.mouse.move(1435,4);await first.focus();assert.equal(await page.locator('.facts-field').getAttribute('data-paused'),'true');await first.click();await page.getByRole('dialog').waitFor();assert.equal(await page.locator('.facts-field').getAttribute('data-paused'),'true');await close();await page.evaluate(()=>document.activeElement?.blur());await page.locator('#activities').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('.facts-field').dataset.paused==='true');
 checks.push({motionSeconds:61,uniqueEntries:seen.size,phases:[...phases],clipStates:clips.size,hoverPause:true,focusPause:true,dialogPause:true,offscreenPause:true});

 await writeFile('docs/v3-motion-frames.json',JSON.stringify(frames,null,2));
 const payloadMatches=(await Promise.all(payloadReads)).flat();assert.deepEqual(payloadMatches,[],'restricted raw values absent from delivered HTML and JS');for(const value of forbidden)assert.ok(!(await page.locator('body').innerText()).includes(value));
 assert.deepEqual(errors,[],'runtime errors');assert.deepEqual(requests,[],'external requests');assert.deepEqual(httpErrors,[],'HTTP errors');
 checks.push({noRestrictedValuesInRuntimePayload:true});
 await writeFile('docs/v3-verification.json',JSON.stringify({status:'passed',checks,errors,httpErrors,externalRequests:requests},null,2));console.log(JSON.stringify({status:'passed',checks,errors},null,2));
}catch(error){await writeFile('docs/v3-verification.json',JSON.stringify({status:'failed',error:String(error),checks,errors,httpErrors},null,2));console.error(error);await page.screenshot({path:path.join(out,'verification-failure.png'),fullPage:true});process.exitCode=1;}
finally{await browser.close();}
