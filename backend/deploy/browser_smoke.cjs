// Real local browser smoke check. Reads only generated preview credentials; never logs them.
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const { chromium } = require(path.join(root,'.runtime/browser/node_modules/playwright'));
const c = JSON.parse(fs.readFileSync(path.join(root,'.runtime/preview-credentials.json')));
const fixture = JSON.parse(fs.readFileSync(path.join(root,'.runtime/preview-fixtures.json')));
const base = 'http://127.0.0.1:8090';
const report = {checked_on:'2026-11-11',scope:'local native-module preview; not project acceptance or load testing',browser:'Microsoft Edge / Playwright',pages:[],javascript_errors:[],asset_errors:[]};
(async () => {
 const browser = await chromium.launch({executablePath:'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',headless:true,timeout:20000,args:['--disable-gpu']});
 try {
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>report.javascript_errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400 && /\.(css|js|woff2?|png)(\?|$)/.test(r.url())) report.asset_errors.push({url:r.url().replace(base,''),status:r.status()});});
  await page.goto(base,{waitUntil:'networkidle'});
  await page.locator('input[name="Login[username]"]').fill(c.admin_username);
  await page.locator('form').filter({has:page.locator('input[name="Login[username]"]')}).locator('button[type="submit"]').click();
  await page.locator('input[type="password"]').waitFor();
  await page.locator('input[type="password"]').fill(c.admin_password);
  await Promise.all([page.waitForURL(/dashboard/, {timeout:30000}),page.locator('form').filter({has:page.locator('input[type="password"]')}).locator('button[type="submit"]').click()]);
  await page.waitForLoadState('networkidle');
  // The upstream stream uses delayed jQuery fade-in, beyond CSS animation controls.
  await page.waitForTimeout(1000);
  fs.mkdirSync(path.join(root,'docs/preview'),{recursive:true});
  await page.screenshot({path:path.join(root,'docs/preview/clean-theme-dashboard.png'),fullPage:false});
  report.pages.push({kind:'dashboard',status:200,title:await page.title()});
  await page.goto(new URL(fixture.space_a_url,base).href,{waitUntil:'networkidle'});
  await page.getByText('免费模块预览：这里用于体验帖子、评论、文件和 Clean Theme。',{exact:false}).first().waitFor({state:'visible',timeout:30000});
  report.space_demo_post_visible=true;
  await page.waitForTimeout(1000);
  await page.screenshot({path:path.join(root,'docs/preview/clean-theme-space.png'),fullPage:false});
  const links=await page.locator('a[href]').evaluateAll(xs=>xs.map(a=>({text:a.innerText.trim(),href:a.getAttribute('href')})));
  report.space_navigation=links.filter(x=> /calendar|questions|gallery|linklist/.test(x.href));
  const targets=[{kind:'space',url:fixture.space_a_url},{kind:'question',url:fixture.question_url},{kind:'messenger',url:'/mail/mail/index'},{kind:'installed-modules',url:'/admin/module/list'},{kind:'pdf-viewer',url:'/pdf-viewer/view/open?guid='+encodeURIComponent(fixture.pdf_guid)+'&file='+encodeURIComponent(fixture.pdf_url)}];
  for(const id of ['calendar','questions','gallery','linklist']) {
   // Q&A is a stream content type; it does not promise a persistent sidebar item.
   if(id==='questions') {targets.push({kind:id,url:fixture.question_url});continue;}
   const link=report.space_navigation.find(x=>x.href.startsWith(fixture.space_a_url) && (x.href.endsWith('/'+id) || x.href.includes('/'+id+'/')) && !/\/(export|entry|container-config)\//.test(x.href));
   if(link) targets.push({kind:id,url:link.href});
   else report.pages.push({kind:id,error:'Space navigation entry not found'});
  }
  for(const target of targets) {
   const response=await page.goto(new URL(target.url,base).href,{waitUntil:'networkidle'});
   report.pages.push({kind:target.kind,status:response.status(),title:await page.title(),url:new URL(page.url()).pathname});
  }
  const pdf=await page.request.get(fixture.pdf_url);
  report.pdf={status:pdf.status(),content_type:pdf.headers()['content-type'],has_pdf_header:(await pdf.body()).subarray(0,5).toString()==='%PDF-'};
  for(const url of ['/.env','/.runtime/preview-credentials.json','/protected/config/common.php','/deploy/bootstrap.php','/uploads/files/test.pdf']) {
   const r=await page.request.get(base+url);report.pages.push({kind:'blocked-source',url,status:r.status()});
  }
  report.passed=!(report.javascript_errors.length || report.asset_errors.length || report.pages.some(p=>p.error || (p.kind==='blocked-source'?p.status!==404:p.status!==200)) || !report.pdf.has_pdf_header);
  fs.writeFileSync(path.join(root,'deploy/browser-smoke.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  if(report.javascript_errors.length || report.asset_errors.length || report.pages.some(p=>p.error || (p.kind==='blocked-source'?p.status!==404:p.status!==200)) || !report.pdf.has_pdf_header) process.exitCode=1;
 } finally {await browser.close();}
})().catch(e=>{console.error(e.message.slice(0,1100));process.exit(1)});
