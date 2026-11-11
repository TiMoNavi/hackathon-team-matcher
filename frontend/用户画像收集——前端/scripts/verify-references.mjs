import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1080}});
const report={errors:[],views:[],checks:[]};
page.on("pageerror",e=>report.errors.push(e.message));
const base="http://127.0.0.1:4199";
try {
  await page.goto(base+"/references?scene=onboarding",{waitUntil:"networkidle"});
  let f=page.frames().find(x=>x.url().includes("/references/view/"));
  await f.getByRole("button",{name:"Continue",exact:true}).click();
  await f.getByLabel("Company name",{exact:true}).fill("Studio");
  await f.getByRole("button",{name:"Add name",exact:true}).click();
  await f.getByRole("button",{name:"Continue",exact:true}).click();
  await f.getByRole("radio",{name:"Friendly",exact:true}).click();
  await f.getByRole("button",{name:"Continue",exact:true}).click();
  assert.ok((await f.locator("body").textContent()).includes("Studio"));
  await f.getByRole("button",{name:"Open dashboard",exact:true}).click();
  await f.getByRole("status").waitFor();
  await f.getByRole("button",{name:"关闭",exact:true}).click();
  await page.screenshot({path:"artifacts/references-ready-desktop.png",fullPage:true});
  await f.getByRole("button",{name:"Back",exact:true}).click();
  assert.equal(await f.getByRole("radio",{name:"Friendly",exact:true}).getAttribute("aria-checked"),"true");
  report.checks.push("Four-step flow, selected values, ready summary, finish feedback and back navigation");
  const scenes=["onboarding","frost-cloud","glow-keyboard","enrichment-orbit","agent-gallery","gradient-floor"];
  for(const [width,height] of [[1440,1080],[768,1000],[390,844],[320,740]]){
    await page.setViewportSize({width,height});
    for(const scene of scenes){
      await page.goto(base+"/references/view/"+scene,{waitUntil:"networkidle"});
      await page.waitForTimeout(200);
      const bounds=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,height:innerHeight,body:document.body.getBoundingClientRect().height,animations:document.getAnimations().length}));
      assert.ok(bounds.scroll<=width+1,scene+" overflows at "+width+": "+bounds.scroll);
      report.views.push({scene,...bounds});
      if(width===1440&&["frost-cloud","glow-keyboard","agent-gallery"].includes(scene))await page.screenshot({path:"artifacts/reference-"+scene+"-desktop.png",fullPage:true});
    }
    await page.goto(base+"/references?scene=onboarding",{waitUntil:"networkidle"});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    if(width===1440||width===390)await page.screenshot({path:"artifacts/references-"+width+".png",fullPage:true});
  }
  await page.setViewportSize({width:1440,height:1080});
  await page.getByRole("button",{name:"切换夜间",exact:true}).click();
  f=page.frames().find(x=>x.url().includes("/references/view/"));
  await f.waitForURL(/theme=dark/);
  await f.waitForFunction(()=>document.documentElement.dataset.theme==="dark");
  await page.screenshot({path:"artifacts/references-dark.png",fullPage:true});
  await page.getByRole("button",{name:/云朵 AI 角色/}).click();
  f=page.frameLocator("iframe");
  await f.locator(".ui-fc").waitFor();
  await f.locator(".ui-fc").click();
  await page.getByRole("button",{name:"重新播放",exact:true}).click();
  await page.getByRole("button",{name:/展开式场景/}).click();
  f=page.frameLocator("iframe");
  await f.getByRole("button",{name:/Show /}).first().waitFor();
  const panels=f.getByRole("button",{name:/Show /});
  assert.ok(await panels.count()>0);
  await f.locator(".ui-ag__panel[data-open] + .ui-ag__panel .ui-ag__pick").click();
  const nextPanel=f.locator(".ui-ag__panel[data-open] + .ui-ag__panel .ui-ag__pick");
  await nextPanel.focus();
  await nextPanel.press("ArrowRight");
  report.checks.push("Scene selection, dark iframe, replay, cloud click and gallery controls");
  await page.goto(base+"/references/view/glow-keyboard",{waitUntil:"networkidle"});
  await page.locator("input").fill("Hello team");
  assert.equal(await page.locator("input").inputValue(),"Hello team");
  await page.locator("input").press("Enter");
  report.checks.push("Glow Keyboard accepts user input and Enter");
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto(base+"/references/view/enrichment-orbit",{waitUntil:"networkidle"});
  assert.equal(await page.evaluate(()=>document.getAnimations().filter(x=>x.playState==="running").length),0);
  report.checks.push("Orbit respects reduced motion");
  assert.equal(report.errors.length,0);
}finally{
  await fs.writeFile("artifacts/references-verification.json",JSON.stringify(report,null,2));
  await browser.close();
}
console.log(JSON.stringify({checks:report.checks,viewports:report.views.length,errors:report.errors}));

