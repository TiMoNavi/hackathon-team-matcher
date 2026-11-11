const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('/Users/550m/code/hackathon-team-matcher/backend/.runtime/browser/node_modules/playwright');
const root = __dirname;
const allRoutes = [
 {id:'route1-native',name:'原生 PHP 主题改造',url:'http://localhost:8193/comparison-native/home/index'},
 {id:'route2-plugin',name:'独立 React 前端插件',url:'http://localhost:8193/comparison-react/home/index'},
 {id:'route3-standalone',name:'独立 Next.js 前端',url:'http://localhost:3193'}
];
const wanted = process.argv[2] ? process.argv[2].split(',') : allRoutes.map(x=>x.id);
const routes = allRoutes.filter(x=>wanted.includes(x.id));
function check(report,name,pass,details){ report.checks.push({name,passed:!!pass,...(details===undefined?{}:{details})}); }
async function visibleCards(page){return page.locator('[data-testid="member-card"]:visible').count();}
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',headless:true,timeout:20000,args:['--disable-gpu']});
 const reports=[];
 try {
  for(const route of routes){
   const dir=path.join(root,'evidence',route.id);fs.mkdirSync(dir,{recursive:true});
   const report={route:route.id,name:route.name,url:route.url,checked_on:new Date().toISOString(),browser:browser.version(),scope:'same synthetic homepage and interactions; not production API/authentication acceptance',checks:[],javascript_errors:[],asset_errors:[]};
   const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',colorScheme:'light',locale:'zh-CN'});
   const page=await context.newPage();page.setDefaultTimeout(8000);
   page.on('pageerror',e=>report.javascript_errors.push(e.message));
   page.on('response',r=>{if(r.status()>=400&&/\.(?:css|js|woff2?|png|jpg|svg)(?:\?|$)/.test(r.url()))report.asset_errors.push({path:new URL(r.url()).pathname,status:r.status()});});
   try {
    const started=Date.now();const response=await page.goto(route.url,{waitUntil:'networkidle',timeout:30000});report.navigation_ms=Date.now()-started;
    check(report,'homepage_http_200',response&&response.status()===200,response&&response.status());
    await page.getByTestId('member-search').waitFor();await page.evaluate(()=>document.fonts.ready);
    await page.waitForTimeout(300);await page.screenshot({path:path.join(dir,'desktop.png'),fullPage:false});
    check(report,'four_initial_members',await visibleCards(page)===4,await visibleCards(page));
    check(report,'synthetic_data_label',await page.getByText('交互演示 · 非真实成员数据',{exact:false}).count()>0);
    await page.locator('[data-role-filter="前端"]').click();check(report,'role_filter_frontend',await visibleCards(page)===1&&await page.locator('[data-testid="member-card"][data-member-id="lin"]:visible').count()===1);
    await page.locator('[data-role-filter="全部"]').click();await page.getByTestId('member-search').fill('Python');
    await page.waitForTimeout(200);check(report,'skill_search_python',await visibleCards(page)===1&&await page.locator('[data-testid="member-card"][data-member-id="chen"]:visible').count()===1);
    await page.getByTestId('member-search').fill('无此成员xyz');await page.waitForTimeout(150);check(report,'empty_search_zero_members',await visibleCards(page)===0);
    await page.getByTestId('member-search').fill('');await page.waitForTimeout(150);check(report,'clear_search_restores_members',await visibleCards(page)===4);
    const follow=page.getByTestId('member-follow-lin');const followState=()=>follow.evaluate(el=>({text:el.innerText.trim(),pressed:el.getAttribute('aria-pressed'),label:el.getAttribute('aria-label')}));const before=await followState();await follow.click();const after=await followState();check(report,'follow_state_toggles',(before.pressed==='false'&&after.pressed==='true')||(before.label!==after.label&&String(after.label).includes('取消关注'))||(before.text!==after.text&&after.text.includes('已关注')),{before,after});await follow.click();
    await page.getByTestId('member-details-lin').click();const dialog=page.getByRole('dialog');await dialog.waitFor({state:'visible'});check(report,'member_detail_dialog',await dialog.innerText().then(x=>x.includes('林舟')));
    await page.screenshot({path:path.join(dir,'detail.png'),fullPage:false});await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});check(report,'escape_closes_detail',await dialog.isVisible()===false);
    await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0)});await page.waitForTimeout(300);
    report.desktop=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth,hasHumhub:!!window.humhub,hasJquery:!!window.jQuery,hasPjax:!!window.jQuery?.pjax,hasNativeTopbar:!!document.querySelector('#topbar'),stylesheets:Array.from(document.styleSheets).map(s=>s.href).filter(Boolean)}));
    check(report,'desktop_no_horizontal_overflow',Math.max(report.desktop.document,report.desktop.body)<=1441);
    report.resources=await page.evaluate(()=>performance.getEntriesByType('resource').filter(x=>['script','link','css'].includes(x.initiatorType)).map(x=>({url:x.name,initiator:x.initiatorType,decoded_bytes:x.decodedBodySize,encoded_bytes:x.encodedBodySize})));
    report.initial_resource_decoded_bytes=report.resources.reduce((sum,r)=>sum+r.decoded_bytes,0);
    let bootstrapCss=false;for(const stylesheet of report.desktop.stylesheets){if(!stylesheet.startsWith(new URL(route.url).origin))continue;const r=await page.request.get(stylesheet);const text=await r.text();if(text.includes('--bs-body-color')||text.includes('Bootstrap v5'))bootstrapCss=true;}
    report.bootstrap_css_detected=bootstrapCss;
    if(route.id!=='route1-native')check(report,'no_native_frontend_assets',!report.desktop.hasHumhub&&!report.desktop.hasJquery&&!report.desktop.hasPjax&&!report.desktop.hasNativeTopbar&&!bootstrapCss);
    else check(report,'native_humhub_runtime_present',report.desktop.hasHumhub||report.desktop.hasJquery||bootstrapCss);
    await page.setViewportSize({width:390,height:844});await page.reload({waitUntil:'networkidle'});await page.getByTestId('member-search').waitFor();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(300);
    report.mobile=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));check(report,'mobile_no_horizontal_overflow',Math.max(report.mobile.document,report.mobile.body)<=391);
    await page.screenshot({path:path.join(dir,'mobile.png'),fullPage:false});
    await page.locator('[data-role-filter="设计"]').click();check(report,'mobile_role_filter',await visibleCards(page)===1&&await page.locator('[data-testid="member-card"][data-member-id="xu"]:visible').count()===1);
    await page.locator('[data-role-filter="全部"]').click();await page.getByTestId('member-details-lin').click();await page.getByRole('dialog').waitFor({state:'visible'});await page.getByRole('button',{name:'关闭详情',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});check(report,'mobile_detail_open_close',true);
   } catch(error) {report.error=error.message.slice(0,1800);check(report,'execution_completed',false);await page.screenshot({path:path.join(dir,'failure.png'),fullPage:false}).catch(()=>{});}
   check(report,'no_javascript_errors',report.javascript_errors.length===0,report.javascript_errors);
   check(report,'no_asset_http_errors',report.asset_errors.length===0,report.asset_errors);
   report.passed=report.checks.every(x=>x.passed);report.passed_count=report.checks.filter(x=>x.passed).length;report.check_count=report.checks.length;
   fs.writeFileSync(path.join(dir,'browser-report.json'),JSON.stringify(report,null,2)+'\n');reports.push(report);
   console.log(JSON.stringify({route:route.id,passed:report.passed,checks:report.passed_count+'/'+report.check_count,error:report.error,failed:report.checks.filter(x=>!x.passed),desktop:report.desktop&&{hasHumhub:report.desktop.hasHumhub,hasJquery:report.desktop.hasJquery},mobile:report.mobile}));
   await context.close();
  }
 } finally {await browser.close()}
 if(reports.some(r=>!r.passed))process.exitCode=1;
})().catch(e=>{console.error(e.message.slice(0,1500));process.exitCode=1});
