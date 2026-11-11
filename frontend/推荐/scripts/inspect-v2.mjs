import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE});
const page=await browser.newPage({viewport:{width:1440,height:900}});
page.on('pageerror',e=>console.log('PAGE ERROR',e.message));page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE ERROR',m.text().slice(0,400));});
await page.goto('http://127.0.0.1:4203/',{waitUntil:'networkidle'});
await page.evaluate(()=>document.fonts.ready);
await page.locator('.search-experience').waitFor({state:'hidden'});
await page.waitForTimeout(900);
await page.getByRole('button',{name:'暂停页面动效',exact:true}).click();
await page.mouse.move(0,0);
mkdirSync('docs/screenshots/v2',{recursive:true});
for(const [width,height] of [[1440,900],[1280,720],[390,844]]){
await page.setViewportSize({width,height});await page.waitForTimeout(600);
await page.screenshot({path:'docs/screenshots/v2/inspect-'+width+'.png',fullPage:true});
console.log(JSON.stringify(await page.evaluate(()=>{
 const rect=s=>document.querySelector(s)?.getBoundingClientRect().toJSON();
 return {size:[innerWidth,innerHeight],scrollWidth:document.documentElement.scrollWidth,card:rect('.person-card'),stage:rect('.showcase-stage'),controls:rect('.browse-controls'),composer:rect('.composer-dock'),dossier:rect('.profile-dossier'),companion:rect('.assistant-companion'),cards:[...document.querySelectorAll('.showcase-card')].map(c=>({rank:c.dataset.rank,r:c.getBoundingClientRect().toJSON(),title:c.querySelector('h3').getBoundingClientRect().toJSON(),bottom:c.querySelector('.project-card-bottom').getBoundingClientRect().toJSON()}))};
})));
}
await page.setViewportSize({width:1440,height:900});await page.getByRole('button',{name:'展开 AI 对话侧栏',exact:true}).click();await page.waitForTimeout(700);
await page.screenshot({path:'docs/screenshots/v2/inspect-sidebar.png'});
await browser.close();
