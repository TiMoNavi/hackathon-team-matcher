import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
mkdirSync('.cache/browser',{recursive:true});
const browser=await chromium.launchPersistentContext(process.cwd()+'/.cache/browser',{headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE,viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const page=await browser.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:4201/',{waitUntil:'networkidle'});
 await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:'docs/screenshots/1440-initial.png',fullPage:true,animations:'disabled'});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'docs/screenshots/390-initial.png',fullPage:true,animations:'disabled'});
 const info={title:await page.title(),errors,overflow:await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth})),tabs:await page.getByRole('tab').allTextContents()};
 writeFileSync('docs/initial-browser.json',JSON.stringify(info,null,2));console.log(JSON.stringify(info));
}finally{await browser.close()}
