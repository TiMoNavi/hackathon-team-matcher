import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:4213/',{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);await page.getByRole('button',{name:'暂停页面动效',exact:true}).click();await page.mouse.move(1435,4);
const sections={};
for(const [width,height] of [[1440,1000],[390,844],[320,800]]){
 await page.setViewportSize({width,height});await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo({top:0,behavior:'instant'});});await page.waitForTimeout(300);
 await page.screenshot({path:'docs/screenshots/v3/'+width+'-full.png',fullPage:true});
 sections[width]=await page.evaluate(()=>Object.fromEntries(['insights','details','work','connect'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return[id,{x:r.x,y:r.y+scrollY,width:r.width,height:r.height}]})));
}
await writeFile('docs/v3-section-bounds.json',JSON.stringify(sections,null,2));
const seen=new Set();
for(let batch=0;batch<4;batch++){
 await page.locator('.facts-wrap').scrollIntoViewIfNeeded();
 const bars=await page.locator('.message-strip').evaluateAll(els=>els.map(el=>{const content=el.querySelector('.message-value');return{id:el.dataset.entry,textOverflow:content.scrollHeight>content.clientHeight+2,overflow:el.scrollWidth>el.clientWidth+2};}));
 bars.forEach(b=>{seen.add(b.id);assert.equal(b.textOverflow,false,b.id+' text overflow');assert.equal(b.overflow,false,b.id+' width overflow');});
 await page.getByRole('button',{name:'换一组',exact:true}).click();
}
assert.equal(seen.size,25);
await page.locator('.facts-wrap').screenshot({path:'docs/screenshots/v3/320-messages-final.png'});
const checks={compactWidth:320,fullPoolEntries:seen.size,noTextOverflow:true};
await writeFile('docs/v3-compact-check.json',JSON.stringify(checks,null,2));console.log(checks);await browser.close();
