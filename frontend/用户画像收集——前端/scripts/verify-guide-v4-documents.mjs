import {chromium} from "playwright";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import ts from "typescript";
const src=await fs.readFile("lib/onboarding/model.ts","utf8");
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const m=await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
const base=process.env.PREVIEW_URL||"http://127.0.0.1:4199";
const phase=process.env.GUIDE_TEST_PHASE||"all";
const report={checkedAt:new Date().toISOString(),phase,passed:false,checks:[],views:[],errors:[]};
const browser=await chromium.launch({headless:true});
function fixture(step){let d=m.createDraft();d.step=step;d.reached=step;if(step>2){d.fields=m.sampleFields();d.sources=[{id:"sample",kind:"resume",label:"示例简历",sample:true,status:"ready"}];}if(step===2)d.sources=[{id:"sample",kind:"resume",label:"示例简历",sample:true,status:"ready"}];if(step>=5){d.answers={communication:"先写下来，异步交流",approach:"做个小样，试试看",partners:"对同一个问题好奇"};d=m.mergeAnswers(d);}d.profileConfirmed=step>=6;if(step>=7){const i=m.makeIdea("让活动后散落在群聊里的想法，变成大家能够继续补充的行动计划。\n\n希望参与者能保留讨论背景，写下下一步，并找到愿意一起尝试的伙伴。","build");Object.assign(i,{audience:"参加线下活动后，想把讨论继续下去的人。",firstStep:"先做一个可共同编辑的页面，邀请三位活动参与者试用。",help:"希望有人一起梳理交互、研究需求，并实现第一版。",status:"ready"});d.ideas=[i];d.activeIdea=i.id;}if(step>=9)d.savedFinal=true;if(step===2)d=m.startJob(d,"sources");if(step===9)d=m.startJob(d,"match");if(step===10)d.matches=m.MATCHES.filter(x=>x.eventId===d.eventId).map(x=>x.id);return d;}
async function pageFor(d=m.createDraft(),width=1440,opts={}){const context=await browser.newContext({viewport:{width,height:width<600?844:1000},colorScheme:opts.dark?"dark":"light",reducedMotion:opts.reduce?"reduce":"no-preference",storageState:{cookies:[],origins:[{origin:base,localStorage:[{name:m.STORAGE_KEY,value:typeof d==="string"?d:JSON.stringify(d)},{name:"guide-theme",value:opts.dark?"dark":"light"}]}]}});if(opts.quota)await context.addInitScript(key=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException("Quota","QuotaExceededError");return set.call(this,k,v);};},m.STORAGE_KEY);const page=await context.newPage();if(opts.clock)await page.clock.install();page.setDefaultTimeout(12000);page.on("pageerror",e=>report.errors.push(e.message));page.on("console",msg=>{if(msg.type()==="error")report.errors.push(msg.text());});await page.goto(base+"/guide",{waitUntil:"domcontentloaded"});await page.locator(".guide-footer").waitFor();return {page,context};}
async function click(p,name){await p.getByRole("button",{name,exact:true}).click();}
async function at(p,n){await p.locator('.guide[data-step="'+n+'"]').waitFor();await p.waitForTimeout(350);}
async function data(p){await p.waitForTimeout(350);await p.locator(".guide-save-status.saved").waitFor();return p.evaluate(key=>JSON.parse(localStorage.getItem(key)),m.STORAGE_KEY);}
async function shot(p,name){await p.screenshot({path:"artifacts/guide-v4-"+name+".png",fullPage:true});}
async function avatar(p,position){await p.locator('.flow-travelling-mascot[data-position="'+position+'"]').waitFor();await p.waitForTimeout(900);const size=await p.evaluate(()=>{const a=[...document.querySelectorAll('[data-mascot-anchor]')].filter(x=>x.getBoundingClientRect().width).at(-1).getBoundingClientRect(),b=document.querySelector('.flow-travelling-mascot').getBoundingClientRect();return {dx:Math.abs(a.x-b.x),dy:Math.abs(a.y-b.y),count:document.querySelectorAll('.flow-cloud').length};});assert.ok(size.dx<3&&size.dy<3,JSON.stringify(size));assert.equal(size.count,1);}
try {
 for(const width of [1440,390]){
  const d=fixture(3);const text=('我希望保留全部经历、动机以及合作方式。这里有完整的上下文，而非几个关键词。\n\n').repeat(450).slice(0,19500)+'\n\n全文结束，保留换行。';
  d.fields.find(f=>f.id==='intro').value=text;
  d.fields.push(...Array.from({length:18},(_,i)=>({id:'long-'+i,label:'项目经历 '+(i+1),value:('项目过程需要结合背景和实际情况，完整讲清楚。\n\n').repeat(15),visibility:i%2?'friends':'private',origin:'test fixture'})));
  const{page:p,context}=await pageFor(d,width);
  await at(p,3);assert.equal(await p.locator('[data-field]').count(),25);
  const start=await p.locator('[data-field="intro"] .flow-prose').evaluate(n=>n.getBoundingClientRect().top);assert.ok(start<700,{width,start});
  await p.locator('[data-field="intro"]').getByRole('button',{name:'编辑 关于我',exact:true}).click();
  await p.waitForTimeout(250);
  const inline=await p.locator('#field-intro').evaluate(n=>({top:n.getBoundingClientRect().top,height:n.clientHeight,scroll:n.scrollHeight,overflow:getComputedStyle(n).overflowY}));
  assert.ok(inline.top>=0&&inline.top<400,JSON.stringify({width,inline}));assert.ok(inline.scroll-inline.height<4,JSON.stringify({width,inline}));
  assert.equal(await p.locator('.flow-reading-pane,.flow-dossier-paper').count(),0);
  await click(p,'专注编辑 关于我');await p.locator('.document-focus[open]').waitFor();await p.waitForTimeout(150);assert.equal(await p.evaluate(()=>document.activeElement.id),'field-intro-focus');
  const dialog=await p.locator('#field-intro-focus').evaluate(n=>({top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom,scroll:n.scrollHeight,height:n.clientHeight,view:innerHeight}));
  assert.ok(dialog.top>30&&dialog.bottom<dialog.view-20,JSON.stringify(dialog));assert.ok(dialog.scroll>dialog.height);
  const edited=text+'\n追加的真实修改。';await p.locator('#field-intro-focus').fill(edited);await shot(p,'focus-'+width);
  await click(p,'返回资料');await p.locator('.document-focus[open]').waitFor({state:'hidden'});assert.equal(await p.locator('#field-intro').inputValue(),edited);
  await data(p);await p.reload();await at(p,3);assert.equal((await data(p)).fields.find(f=>f.id==='intro').value,edited);
  await p.getByRole('navigation',{name:'资料段落目录'}).getByRole('button',{name:/项目经历 18/}).click();
  const lastTop=await p.locator('[data-field="long-17"]').evaluate(n=>n.getBoundingClientRect().top);assert.ok(lastTop>=0&&lastTop<100,{lastTop});
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await p.screenshot({path:'artifacts/guide-v4-long-document-'+width+'.png',fullPage:false});await context.close();
  report.checks.push(width+': 25 fields, nearly 20k characters, full inline growth, visible editor, single focus editor, exact save/reload and outline jump');
 }
 {
 const{page:p,context}=await pageFor();await click(p,'我想直接填写');await at(p,3);await p.locator('#profile-name').fill('夏');assert.deepEqual(await p.locator('[data-field]').evaluateAll(nodes=>nodes.map(n=>n.dataset.field)),['name','intro','role']);await p.locator('#field-intro').fill('保留第二个字段');await p.locator('#field-role').fill('保留第三个字段');await data(p);await p.reload();await at(p,3);assert.equal((await data(p)).fields.length,3);await context.close();report.checks.push('Typing the first nickname character retains all three editable fields');
 }
 {
 const d=fixture(3);d.fields=[{id:'intro',label:'关于我',value:'从真实自述导入的文字。',visibility:'private',origin:'self'}];const{page:p,context}=await pageFor(d);await p.locator('#profile-name').fill('导入者');await click(p,'这些信息正确，继续');await at(p,4);assert.equal((await data(p)).fields.find(f=>f.id==='intro').value,'从真实自述导入的文字。');await context.close();report.checks.push('Imported text without a nickname has an editable nickname and can continue');
 }
 {
 const{page:p,context}=await pageFor(fixture(8));assert.equal(await p.getByTestId('profile-preview').count(),1);assert.equal(await p.locator('[data-field="intro"]').count(),1);await p.locator('[data-field="intro"] select').selectOption('private');await click(p,'其他登录用户');assert.equal(await p.locator('[data-field="intro"]').count(),0);assert.equal(await p.locator('.final-activity').count(),0);await click(p,'我的视角');assert.equal(await p.locator('[data-field="intro"]').count(),1);await context.close();report.checks.push('Final review contains one profile, with working field privacy and audience previews');
 }
 {
 const{page:p,context}=await pageFor(fixture(10),1440);await at(p,10);await p.waitForTimeout(900);await p.mouse.move(2,2);await p.waitForTimeout(9500);await p.waitForTimeout(500);assert.equal(await p.locator('.candidate-story').getAttribute('data-cycle'),'1');
 await click(p,'暂停轮换介绍');await p.mouse.move(2,2);await p.locator('.guide-intro h1').click({force:true});await p.waitForTimeout(12000);assert.equal(await p.locator('.candidate-story').getAttribute('data-cycle'),'1');
 await click(p,'继续轮换介绍');await p.mouse.move(2,2);await p.locator('.guide-intro h1').click({force:true});await p.waitForTimeout(9500);await p.waitForTimeout(400);assert.equal(await p.locator('.candidate-story').getAttribute('data-cycle'),'0');
 await p.locator('.story-row').first().hover();await p.waitForTimeout(12000);assert.equal(await p.locator('.candidate-story').getAttribute('data-cycle'),'0');await p.mouse.move(2,2);await p.waitForTimeout(8000);await click(p,'下一张');await p.mouse.move(2,2);await p.waitForTimeout(1500);assert.equal(await p.locator('.candidate-story').getAttribute('data-person'),'demo-chen');assert.equal(await p.locator('.candidate-story').getAttribute('data-cycle'),'0');
 await click(p,'展开全部');await p.locator('.story-row').nth(4).waitFor();assert.equal(await p.locator('.story-row').count(),5);const visible=await p.locator('.story-stream').textContent();for(const key of ['description','reason','question','contribution'])assert.ok(visible.includes(m.MATCHES[1][key]));await p.waitForTimeout(15000);assert.equal(await p.locator('.story-row').count(),5);assert.equal((await data(p)).pendingFriends.length,0);
 await context.close();report.checks.push('Timed information changes; pause, resume, hover pause, full reading and candidate-change timer cancellation work without social side effects');
 }
 for(const [width,height] of [[1280,720],[1440,900]]){
 const{page:p,context}=await pageFor(fixture(10),width);await p.setViewportSize({width,height});await p.waitForTimeout(1100);const boxes=await p.evaluate(()=>{const a=document.querySelector('.flow-anchor-dock').getBoundingClientRect(),b=[...document.querySelectorAll('.flow-detail-actions button')].find(b=>b.textContent.includes('发送好友申请')).getBoundingClientRect();return {overlap:a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top,buttonBottom:b.bottom,height:innerHeight};});assert.equal(boxes.overlap,false);assert.ok(boxes.buttonBottom<=height,JSON.stringify(boxes));await p.screenshot({path:'artifacts/guide-v4-recommendations-'+width+'.png'});await context.close();report.checks.push(width+'×'+height+': friend action stays visible and clear of docked mascot');
 }
 assert.equal(report.errors.length,0,JSON.stringify(report.errors));report.passed=true;
}catch(error){report.failure=String(error);throw error;}finally{await fs.writeFile('artifacts/guide-v4-verification-documents.json',JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({passed:report.passed,checks:report.checks,errors:report.errors}));
