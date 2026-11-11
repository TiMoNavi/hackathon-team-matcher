import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
await page.goto('http://127.0.0.1:4213/',{waitUntil:'networkidle'});await page.getByRole('button',{name:'暂停页面动效',exact:true}).click();await page.mouse.move(1435,4);
await page.locator('#insights').screenshot({path:'docs/screenshots/v2/1440-insights-final.png'});
await page.setViewportSize({width:390,height:844});await page.locator('#insights').screenshot({path:'docs/screenshots/v2/390-insights-final.png'});
await page.setViewportSize({width:320,height:800});
const seen=new Set();
for(let batch=0;batch<4;batch++){
 await page.locator('.facts-wrap').scrollIntoViewIfNeeded();
 const bars=await page.locator('.message-strip').evaluateAll(els=>els.map(el=>{const content=el.querySelector('.message-value');return{id:el.dataset.entry,textOverflow:content.scrollHeight>content.clientHeight+2,overflow:el.scrollWidth>el.clientWidth+2};}));
 bars.forEach(b=>{seen.add(b.id);assert.equal(b.textOverflow,false,b.id+' text overflow');assert.equal(b.overflow,false,b.id+' width overflow');});
 await page.getByRole('button',{name:'换一组',exact:true}).click();
}
assert.equal(seen.size,27);
await page.locator('.facts-wrap').screenshot({path:'docs/screenshots/v2/320-messages-final.png'});
await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'});});await page.waitForTimeout(250);await page.screenshot({path:'docs/screenshots/v2/390-final-page.png',fullPage:true});const crop=await page.locator('#commitment').boundingBox();await writeFile('.cache/commitment-crop.json',JSON.stringify(crop));
const checks={compactWidth:320,fullPoolEntries:seen.size,noTextOverflow:true};
await writeFile('docs/v2-compact-check.json',JSON.stringify(checks,null,2));console.log(checks);await browser.close();
