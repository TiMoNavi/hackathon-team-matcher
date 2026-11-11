import { createRequire } from 'node:module';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:4213/',{waitUntil:'networkidle'});
await page.getByRole('button',{name:'暂停页面动效',exact:true}).click();
await page.mouse.move(1400,10);await page.evaluate(()=>document.fonts.ready);
const out=path.resolve('docs/screenshots/v2');await mkdir(out,{recursive:true});
const results=[];
for(const [width,height] of [[1440,1000],[768,1024],[390,844],[320,800]]){
 await page.setViewportSize({width,height});await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(200);
 await page.screenshot({path:path.join(out,width+'-hero.png')});await page.screenshot({path:path.join(out,width+'-full.png'),fullPage:true});
 results.push(await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,bars:[...document.querySelectorAll('.message-strip')].map(el=>({text:el.innerText,rect:el.getBoundingClientRect().toJSON(),height:el.clientHeight,scrollHeight:el.scrollHeight})),overflow:[...document.querySelectorAll('main *')].filter(e=>{const b=e.getBoundingClientRect();return b.width>0&&(b.right>innerWidth+1||b.left<-1)&&getComputedStyle(e).position!=='absolute'}).map(e=>e.className).slice(0,20)})));
}
await page.setViewportSize({width:1440,height:1000});await page.locator('#insights').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'1440-insights.png')});
await writeFile('docs/v2-inspection.json',JSON.stringify({results,errors},null,2));
console.log(JSON.stringify({results:results.map(x=>({width:x.width,scrollWidth:x.scrollWidth,bars:x.bars.length,overflow:x.overflow})),errors},null,2));
await browser.close();
