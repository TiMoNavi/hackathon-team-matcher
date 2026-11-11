// Checks only synthetic preview fixtures. No credentials or response bodies are logged.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const {chromium, request} = require(path.join(root,'.runtime/browser/node_modules/playwright'));
const credentials = JSON.parse(fs.readFileSync(path.join(root,'.runtime/preview-credentials.json')));
const fixture = JSON.parse(fs.readFileSync(path.join(root,'.runtime/preview-fixtures.json')));
const base = 'http://127.0.0.1:8090';
const report = {checked_on:'2026-11-11',scope:'native preview access checks; not a complete security audit',checks:[],observations:[]};
function check(name, actual, expected) {
 report.checks.push({name,actual,expected,passed:actual===expected});
}
async function login(browser, username, password) {
 const context=await browser.newContext();const page=await context.newPage();
 await page.goto(base,{waitUntil:'networkidle'});
 await page.locator('input[name="Login[username]"]').fill(username);
 await page.locator('form').filter({has:page.locator('input[name="Login[username]"]')}).locator('button[type="submit"]').click();
 await page.locator('input[type="password"]').fill(password);
 await Promise.all([page.waitForURL(/dashboard/),page.locator('form').filter({has:page.locator('input[type="password"]')}).locator('button[type="submit"]').click()]);
 return context;
}
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',headless:true,args:['--disable-gpu']});
 const contexts=[];
 try {
  const guest=await request.newContext({baseURL:base});contexts.push(guest);
  const api=async(username,password)=>{const ctx=await request.newContext({baseURL:base,extraHTTPHeaders:{Authorization:'Basic '+Buffer.from(username+':'+password).toString('base64'),Accept:'application/json'}});contexts.push(ctx);return ctx;};
  const admin=await api(credentials.admin_username,credentials.admin_password);
  const member=await api('preview_a',credentials.demo_password);
  const apiTests=[['unauthenticated API',guest,'/api/v1/space/'+fixture.space_a_id,401],['admin reads Space A',admin,'/api/v1/space/'+fixture.space_a_id,200],['member reads own Space A',member,'/api/v1/space/'+fixture.space_a_id,200],['member denied private Space B',member,'/api/v1/space/'+fixture.space_b_id,403],['member reads own Space post',member,'/api/v1/post/'+fixture.post_id,200],['ordinary user denied admin User API',member,'/api/v1/user/'+fixture.demo_a_id,403]];
  for(const [name,ctx,url,status] of apiTests) {const r=await ctx.get(url,{maxRedirects:0});check(name,r.status(),status);}
  const spaces=await member.get('/api/v1/space');
  const data=await spaces.json();
  const entries=data.results || data.items || data;
  check('Space listing status',spaces.status(),200);
  check('Space listing excludes private B',Array.isArray(entries)&&!entries.some(x=>Number(x.id)===Number(fixture.space_b_id)),true);
  const a=await login(browser,'preview_a',credentials.demo_password);
  const b=await login(browser,'preview_b',credentials.demo_password);
  for(const [name,ctx,url,status] of [['member A opens A',a,fixture.space_a_url,200],['member A denied B URL',a,fixture.space_b_url,404],['member B denied A URL',b,fixture.space_a_url,404]]) {const r=await ctx.request.get(new URL(url,base).href,{maxRedirects:0});check(name,r.status(),status);}
  for(const [name,ctx,allowed] of [['member A',a.request,true],['nonmember B',b.request,false],['guest',guest,false]]) {
   const r=await ctx.get(new URL(fixture.pdf_url,base).href,{maxRedirects:0});
   const pdf=(await r.body()).subarray(0,5).toString()==='%PDF-';
   check(name+' receives PDF bytes',pdf,allowed);
   report.observations.push({name:name+' PDF download',status:r.status()});
  }
  const modal=await b.request.get(base+'/pdf-viewer/view/index?guid='+encodeURIComponent(fixture.pdf_guid));
  report.observations.push({name:'nonmember B PDF modal metadata',status:modal.status(),exposes_demo_filename:(await modal.text()).includes('humhub-preview.pdf'),note:'Viewer wrapper is checked separately from protected file bytes.'});
  await a.close();await b.close();
 } finally {await browser.close();for(const c of contexts)await c.dispose();}
 report.passed=report.checks.every(x=>x.passed);
 report.security_signoff=false;
 report.known_issues=report.observations.some(x=>x.exposes_demo_filename)?['PDF Viewer modal exposes the filename to a nonmember with a known GUID; actual PDF download is denied.']:[];
 fs.writeFileSync(path.join(root,'deploy/access-smoke.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
 if(!report.passed)process.exitCode=1;
})().catch(e=>{console.error(e.message.slice(0,800));process.exit(1);});
