import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=process.env.MATCHER_REVIEW_ROOT||'/Users/550m/code/hackathon-team-matcher';
const work=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(path.join(root,'frontend/用户画像收集——前端/package.json'));
const {chromium}=require('playwright');
const build=path.join(work,'browser-build'),origin='http://127.0.0.1:4305';
const bootstrap={schema_version:1,base_path:'/matcher/app',api_base:'/api/v1',native_home_url:'/dashboard',native_login_url:'/user/auth/login',csrf_header:'X-CSRF-Token',csrf_token:'synthetic-browser-fixture'};
const index=(await fs.readFile(path.join(build,'index.html'),'utf8')).replace('</head>','<script id="matcher-webapp-bootstrap" type="application/json">'+JSON.stringify(bootstrap)+'</script></head>');
const sourceId='11111111-1111-1111-1111-111111111111',meta={request_id:'a'.repeat(24)};
const envelope=data=>({data,meta});const failure=code=>({error:{code,message:'SERVER-SECRET-CANARY',retryable:false,details:[]},meta});
const checks=[],errors=[],requests=[];let unexpectedNetwork=0;const browser=await chromium.launch({headless:true});
function check(name,ok,actual){checks.push({name,passed:!!ok,...(!ok&&actual!==undefined?{actual}:{})});}
async function until(fn){for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('Deferred route was not reached');}
async function scenario(opts={}){
 const state={actor:1,receipt:'succeeded',sourceState:'ready',sourceStatus:'ready',sourceError:0,receiptError:0,meError:0,delayReceipt:false,delaySource:false,...opts};
 const context=await browser.newContext();const page=await context.newPage();let releaseReceipt,releaseSource;const receipts=[],sources=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url()),p=url.pathname;requests.push({method:request.method(),path:p});
  const json=(status,data)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  try{
   if(url.origin!==origin){unexpectedNetwork++;return route.abort();}
   if(p.includes('/assets/')){const name=p.slice(p.lastIndexOf('/assets/')+8);if(name!==path.basename(name))throw Error('Invalid asset');return route.fulfill({status:200,contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'font/woff2',body:await fs.readFile(path.join(build,'assets',name))});}
   if(p.startsWith('/matcher/app'))return route.fulfill({status:200,contentType:'text/html',body:index});
   if(p==='/favicon.ico')return route.fulfill({status:204,body:''});
   if(request.method()!=='GET')throw Error('Unexpected mutation');
   if(p==='/api/v1/me')return json(state.meError||200,state.meError?failure('ACCOUNT_UNAVAILABLE'):envelope({user_id:state.actor,nickname:'合成账号'+state.actor,identity_version:1,avatar_ref:null}));
   if(p==='/api/v1/me/current-event')return json(409,failure('CURRENT_EVENT_REQUIRED'));
   if(p==='/api/v1/auth/github/import-status'){
    const receipt=state.receipt,error=state.receiptError,actor=state.actor;receipts.push(actor);
    if(state.delayReceipt&&actor===1)await new Promise(resolve=>{releaseReceipt=resolve;});
    return json(error||200,error?failure('AUTHENTICATION_REQUIRED'):envelope({state:receipt,source_id:['succeeded','failed'].includes(receipt)?sourceId:null}));
   }
   if(p==='/api/v1/me/profile/sources/'+sourceId+'/progress'){
    const sourceState=state.sourceState,sourceStatus=state.sourceStatus,error=state.sourceError,actor=state.actor;sources.push(actor);
    if(state.delaySource&&actor===1)await new Promise(resolve=>{releaseSource=resolve;});
    return json(error||200,error?failure(error===404?'SOURCE_NOT_FOUND':'AUTHENTICATION_REQUIRED'):envelope({id:sourceId,source_id:sourceId,kind:'github',status:sourceStatus,progress:{schema_version:1,state:sourceState,percent:null}}));
   }
   throw Error('Unexpected route '+p);
  }catch(error){if(!page.isClosed())errors.push(error.message);try{await route.abort();}catch{}}
 });
 await page.goto(origin+'/matcher/app',{waitUntil:'domcontentloaded'});await page.locator('[data-state="ready"]').waitFor();
 return {context,page,state,receipts,sources,releaseReceipt:()=>releaseReceipt?.(),releaseSource:()=>releaseSource?.()};
}
try{
 let s=await scenario();await s.page.locator('[data-import-state="succeeded"]').waitFor();check('live component reads saved receipt then source using exactly two GETs',s.receipts.length===1&&s.sources.length===1);
 s.state.receipt='revoked';await s.page.getByRole('button',{name:'重新读取状态',exact:true}).click();await s.page.locator('[data-import-state="revoked"]').waitFor();check('manual refresh clears previous success when receipt is revoked',!(await s.page.getByRole('heading',{name:'GitHub 公开资料已读取',exact:true}).count())&&s.sources.length===1);await s.context.close();
 s=await scenario({delayReceipt:true});await until(()=>s.receipts.length===1);s.state.actor=2;s.state.receipt='not_requested';await s.page.getByRole('button',{name:'重新读取',exact:true}).click();await s.page.getByRole('heading',{name:'合成账号2，欢迎回来',exact:true}).waitFor();await until(()=>s.receipts.includes(2));s.releaseReceipt();await s.page.waitForTimeout(100);check('late receipt from old account does not render after session refresh switches account',await s.page.locator('[data-import-state="succeeded"]').count()===0);check('late old receipt does not start a source lookup for the new account',s.sources.length===0);await s.context.close();
 s=await scenario({delaySource:true});await until(()=>s.sources.length===1);s.state.actor=2;s.state.receipt='not_requested';await s.page.getByRole('button',{name:'重新读取',exact:true}).click();await s.page.getByRole('heading',{name:'合成账号2，欢迎回来',exact:true}).waitFor();await until(()=>s.receipts.includes(2));s.releaseSource();await s.page.waitForTimeout(100);check('late source progress from old account cannot restore prior success',await s.page.locator('[data-import-state="succeeded"]').count()===0);await s.context.close();
 s=await scenario({sourceError:404});await s.page.locator('[data-import-state="revoked"]').waitFor();check('source 404 overrides old receipt success',s.receipts.length===1&&s.sources.length===1);await s.context.close();
 s=await scenario({sourceError:403});await s.page.locator('[data-import-state="session"]').waitFor();check('source permission failure shows session recovery and no success',await s.page.getByRole('button',{name:'刷新页面',exact:true}).count()===1&&await s.page.locator('[data-import-state="succeeded"]').count()===0);check('server diagnostics are not rendered',(await s.page.locator('body').innerText()).includes('SERVER-SECRET-CANARY')===false);await s.context.close();
 s=await scenario({receipt:'unavailable'});await s.page.locator('[data-import-state="unavailable"]').waitFor();check('unavailable receipt never reads historical source',s.sources.length===0);await s.context.close();
 s=await scenario({receipt:'UNTRUSTED-STATE-CANARY'});await s.page.locator('[data-import-state="read"]').waitFor();check('unknown receipt fails closed without echoing server text',!(await s.page.locator('body').innerText()).includes('UNTRUSTED-STATE-CANARY')&&s.sources.length===0);await s.context.close();
 s=await scenario();await s.page.locator('[data-import-state="succeeded"]').waitFor();s.state.meError=403;await s.page.getByRole('button',{name:'重新读取',exact:true}).click();await s.page.locator('[data-state="forbidden"]').waitFor();check('disabled account refresh unmounts import notice',await s.page.locator('.github-import-notice').count()===0);await s.context.close();
 check('all intercepted operations remained GET-only',requests.every(x=>x.method==='GET'));check('no browser request escaped local interception',unexpectedNetwork===0);check('no browser page errors',errors.length===0,errors);
}catch(error){check('browser scenarios completed',false,error.message);}finally{await browser.close();}
const report={status:checks.every(x=>x.passed)?'passed':'failed',checks:checks.length,passed:checks.filter(x=>x.passed).length,failed:checks.filter(x=>!x.passed).length,checks_detail:checks,scope:'actual current Vite build, Chromium, all requests intercepted; no production login or server connection',intercepted_browser_requests:requests.length,external_network_requests:unexpectedNetwork,model_calls:0,real_oauth:false,page_errors:errors};
await fs.writeFile(path.join(work,'browser-result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks,passed:report.passed,failed:report.failed}));console.log(JSON.stringify(checks.filter(x=>!x.passed),null,2));
