import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE});
const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4203/',{waitUntil:'networkidle'});
await page.locator('.search-experience').waitFor({state:'hidden'});await page.evaluate(()=>document.fonts.ready);
mkdirSync('docs/screenshots/v3',{recursive:true});
const layouts=[];
for(const [width,height] of [[1440,900],[1280,720],[1100,900],[768,1024],[390,844],[320,740]]){
 await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(300);
 layouts.push(await page.evaluate(()=>{const r=s=>document.querySelector(s)?.getBoundingClientRect().toJSON();return{size:[innerWidth,innerHeight],scrollWidth:document.documentElement.scrollWidth,stage:r('.showcase-stage'),controls:r('.browse-controls'),composer:r('.composer-dock'),companion:r('.assistant-companion'),dossier:r('.profile-dossier'),cards:[...document.querySelectorAll('.showcase-card')].filter(e=>Number(e.dataset.rank)<2).map(e=>({rank:e.dataset.rank,height:e.clientHeight,content:e.querySelector('.project-surface').scrollHeight,visible:e.querySelector('.project-surface').clientHeight,title:e.querySelector('h3').clientHeight,lh:getComputedStyle(e.querySelector('h3')).lineHeight}))};}));
 await page.screenshot({path:'docs/screenshots/v3/initial-'+width+'.png'});
}
await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>scrollTo(0,0));await page.getByRole('button',{name:'下翻，认识完整的 TA',exact:true}).click();await page.waitForTimeout(200);await page.screenshot({path:'docs/screenshots/v3/initial-list.png'});
await page.locator('.profile-insight').scrollIntoViewIfNeeded();await page.screenshot({path:'docs/screenshots/v3/initial-analysis.png'});
await page.evaluate(()=>scrollTo(0,0));await page.getByRole('button',{name:'展开 AI 对话侧栏',exact:true}).click();await page.waitForTimeout(200);await page.screenshot({path:'docs/screenshots/v3/initial-sidebar.png'});
writeFileSync('docs/inspection-v3.json',JSON.stringify({layouts,errors},null,2));
console.log(JSON.stringify({layouts,errors}));await browser.close();
