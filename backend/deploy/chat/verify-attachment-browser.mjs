import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const origin='http://127.0.0.1:8124';
const integration=path.resolve(fileURLToPath(new URL('../../../frontend/对话 群聊页面/integration/',import.meta.url)));
const out=path.join(integration,'artifacts/attachment-browser');
const require=createRequire(new URL('../../../frontend/用户画像收集——前端/package.json',import.meta.url));
const report={passed:false,checks:[],normalNativeFormLogins:0,newMessages:0,sendPosts:0,uploadPosts:0,cancelDeletes:0,downloadGets:0,receiptWrites:0,blockedReceiptWrites:0,blockedExternalRequests:0,unexpectedRequests:0,syntheticOnly:true,credentialsReturned:false,responseLoss:{committedBeforeAbort:false,sameKeyAndAttachments:false},screenshots:[],viewports:[]};
let fixture,browser,stage='preflight',loss=null;const contexts=[];const newIds=new Set();
const check=(name,value=true)=>{assert.ok(value,name);report.checks.push(name);};
async function writeArtifact(name,bytes){
 assert.match(name,/^(?:attachment-(?:1440|320)-(?:day|night)[.]png|attachment-browser-report[.]json)$/);
 for(const dir of [path.join(integration,'artifacts'),out]){await fs.mkdir(dir,{recursive:true,mode:0o700});const info=await fs.lstat(dir);assert.ok(info.isDirectory()&&!info.isSymbolicLink());assert.equal(await fs.realpath(dir),dir);}
 const target=path.join(out,name);try{const info=await fs.lstat(target);assert.ok(info.isFile()&&!info.isSymbolicLink()&&info.nlink===1);}catch(e){if(e.code!=='ENOENT')throw e;}
 const handle=await fs.open(target,fsConstants.O_WRONLY|fsConstants.O_CREAT|fsConstants.O_NOFOLLOW,0o600);try{await handle.truncate(0);await handle.writeFile(bytes);}finally{await handle.close();}
}
async function input(){let raw='';for await(const chunk of process.stdin){raw+=chunk;assert.ok(raw.length<16384);}const value=JSON.parse(raw);assert.equal(value.kind,'chat-c05b-browser-stdin-v1');assert.equal(value.parent_pid,process.ppid);assert.ok(Number.isSafeInteger(value.conversation_id)&&value.conversation_id>0);for(const role of ['a','b']){assert.equal(value.actors[role].username,'chat_c05b_'+role);assert.match(value.actors[role].password,/^[a-f0-9]{48}$/);}return value;}
const base=()=>'/api/v1/conversations/'+fixture.conversation_id;
async function actor(role){
 const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'dark',serviceWorkers:'block',acceptDownloads:true});contexts.push(context);const page=await context.newPage();let losing=false;const failures=[];
 await context.route('**/*',async(route)=>{
  const req=route.request();const url=new URL(req.url());
  if(url.protocol==='blob:')return route.continue();
  if(url.origin!==origin){report.blockedExternalRequests++;return route.abort();}
  if(url.pathname.startsWith('/api/v1/')){
   if(req.method()==='PUT'){report.blockedReceiptWrites++;return route.abort();}
   if(!(url.pathname==='/api/v1/conversations'||url.pathname.startsWith(base()+'/'))){report.unexpectedRequests++;return route.abort();}
   if(req.method()==='POST'&&url.pathname===base()+'/attachments')report.uploadPosts++;
   if(req.method()==='DELETE')report.cancelDeletes++;
   if(req.method()==='GET'&&url.pathname.endsWith('/download'))report.downloadGets++;
   if(req.method()==='POST'&&url.pathname===base()+'/messages'){
    report.sendPosts++;const payload=req.postDataJSON();
    if(losing){losing=false;const response=await route.fetch();const data=await response.json();assert.equal(response.status(),201);loss={payload,id:data.data.message.id};newIds.add(loss.id);report.responseLoss.committedBeforeAbort=true;await route.abort('failed');return;}
   }
  }
  await route.continue();
 });
 page.on('pageerror',()=>failures.push('pageerror'));
 page.on('response',async(response)=>{try{if(new URL(response.url()).pathname===base()+'/messages'&&response.request().method()==='POST'&&response.status()===201){const data=await response.json();newIds.add(data.data.message.id);}}catch{failures.push('response');}});
 return {role,context,page,failures,loseNext(){losing=true;}};
}
async function login(a){
 await a.page.goto(origin+'/user/auth/login',{waitUntil:'networkidle'});await a.page.locator('#login_username:not([readonly])').fill(fixture.actors[a.role].username);await a.page.locator('#continue-button').click();await a.page.locator('#login_password').waitFor();await a.page.locator('#login_password').fill(fixture.actors[a.role].password);
 const response=a.page.waitForResponse(r=>new URL(r.url()).pathname==='/user/auth/password'&&r.request().method()==='POST');await a.page.locator('#login-button').click();assert.equal((await response).status(),302);await a.page.waitForURL(u=>!u.pathname.startsWith('/user/auth/'));report.normalNativeFormLogins++;
 await open(a);
}
async function open(a){await a.page.goto(origin+'/matcher/chat/conversations/'+fixture.conversation_id,{waitUntil:'networkidle'});await a.page.locator('#chat-read-draft:not([disabled])').waitFor();await a.page.locator('#chat-attachment-input').waitFor({state:'attached'});}
async function upload(a,name,bytes){
 const before=report.uploadPosts;await a.page.locator('#chat-attachment-input').setInputFiles({name,mimeType:'text/plain',buffer:bytes});await a.page.waitForTimeout(100);check('selecting a file does not upload',report.uploadPosts===before);
 const response=a.page.waitForResponse(r=>new URL(r.url()).pathname===base()+'/attachments'&&r.request().method()==='POST');await a.page.getByRole('button',{name:'上传附件 '+name,exact:true}).click();const r=await response;assert.equal(r.status(),201);const data=await r.json();await a.page.locator('[data-upload-state="ready"]').waitFor();return data.data.attachment.id;
}
async function send(a,body){await a.page.locator('#chat-read-draft').fill(body);const response=a.page.waitForResponse(r=>new URL(r.url()).pathname===base()+'/messages'&&r.request().method()==='POST');await a.page.getByRole('button',{name:'发送',exact:true}).click();const r=await response;assert.equal(r.status(),201);return (await r.json()).data.message;}
try{
 fixture=await input();const {chromium}=require('playwright');browser=await chromium.launch({headless:true});const a=await actor('a'),b=await actor('b');
 stage='native-logins';await login(a);await login(b);check('two normal native form logins',report.normalNativeFormLogins===2);
 stage='upload-and-send';const bytes=Buffer.from('Synthetic C05B browser attachment 中文🙂\n');const id=await upload(a,'browser.txt',bytes);const message=await send(a,'Synthetic C05B browser attached');assert.equal(message.attachments[0].id,id);check('real page uploaded and bound one native attachment');
 stage='peer-download';await open(b);const row=b.page.locator('[data-attachment-id="'+id+'"]');await row.waitFor();const previous=report.downloadGets;await b.page.waitForTimeout(100);check('history does not automatically download',report.downloadGets===previous);
 await row.getByRole('button',{name:'下载附件 browser.txt',exact:true}).click();const save=b.page.getByRole('link',{name:'保存附件 browser.txt',exact:true});await save.waitFor();await b.page.getByRole('button',{name:'关闭下载',exact:true}).click();await save.waitFor({state:'detached'});check('closing download revokes visible Blob link');await row.getByRole('button',{name:'下载附件 browser.txt',exact:true}).click();await save.waitFor();const downloaded=b.page.waitForEvent('download');await save.click();const file=await downloaded;const stream=await file.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);assert.equal(createHash('sha256').update(Buffer.concat(chunks)).digest('hex'),createHash('sha256').update(bytes).digest('hex'));await file.delete();check('peer explicitly downloaded identical bytes');await save.waitFor({state:'detached'});check('saving download revokes Blob link');
 stage='cancel';await upload(a,'cancel-browser.txt',Buffer.from('Synthetic cancellable attachment'));const cancelled=a.page.waitForResponse(r=>r.request().method()==='DELETE'&&new URL(r.url()).pathname.startsWith(base()+'/attachments/'));await a.page.getByRole('button',{name:'取消附件 cancel-browser.txt',exact:true}).click();assert.equal((await cancelled).status(),200);await a.page.locator('[data-upload-key]').waitFor({state:'detached'});check('explicit cancel reaches backend');
 stage='uncertain-send';const uncertainId=await upload(a,'uncertain-browser.txt',Buffer.from('Synthetic uncertain attachment'));await a.page.locator('#chat-read-draft').fill('Synthetic C05B browser uncertain');a.loseNext();await a.page.getByRole('button',{name:'发送',exact:true}).click();const retry=a.page.getByRole('button',{name:'重试原消息',exact:true});await retry.waitFor();assert.ok(loss);const replayResponse=a.page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===base()+'/messages');await retry.click();const replay=await replayResponse;assert.equal(replay.status(),200);const replayData=await replay.json();const replayPayload=replay.request().postDataJSON();assert.deepEqual(replayPayload,loss.payload);assert.equal(replayData.data.message.id,loss.id);assert.deepEqual(replayPayload.attachment_ids,[uncertainId]);report.responseLoss.sameKeyAndAttachments=true;check('lost committed response retries same key and bound attachment');await a.page.locator('[data-conversation-id="'+fixture.conversation_id+'"]').waitFor();check('replay safely refills authorized conversation list');
 stage='viewports';for(const width of [1440,320])for(const dark of [false,true]){
  await a.page.setViewportSize({width,height:width===320?850:1000});if(await a.page.locator('html').evaluate(e=>e.classList.contains('dark'))!==dark)await a.page.getByRole('button',{name:dark?'切换至夜间模式':'切换至日间模式',exact:true}).click();await a.page.waitForTimeout(100);const metrics=await a.page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,dark:document.documentElement.classList.contains('dark')}));assert.ok(metrics.scroll<=width+1);assert.equal(metrics.dark,dark);report.viewports.push(metrics);const name='attachment-'+width+'-'+(dark?'night':'day')+'.png';await writeArtifact(name,await a.page.screenshot({fullPage:true}));report.screenshots.push(name);
 }
 check('four desktop/mobile day/night layouts');assert.equal(a.failures.length+b.failures.length,0);assert.equal(report.unexpectedRequests,0);assert.equal(report.blockedExternalRequests,0);report.newMessages=newIds.size;assert.equal(report.newMessages,2);assert.equal(report.sendPosts,3);assert.equal(report.uploadPosts,3);assert.equal(report.cancelDeletes,1);report.passed=true;stage='complete';
}catch(e){report.failedStage=stage;report.failureType=e.name;}
finally{report.newMessages=newIds.size;for(const ctx of contexts)await ctx.close().catch(()=>{});if(browser)await browser.close();report.stage=stage;await writeArtifact('attachment-browser-report.json',JSON.stringify(report,null,2)+'\n');process.stdout.write(JSON.stringify({passed:report.passed,checks:report.checks.length,normalNativeFormLogins:report.normalNativeFormLogins,newMessages:report.newMessages,sendPosts:report.sendPosts,uploadPosts:report.uploadPosts,cancelDeletes:report.cancelDeletes,failedStage:report.failedStage??null,report:'integration/artifacts/attachment-browser/attachment-browser-report.json'})+'\n');process.exitCode=report.passed?0:1;}
