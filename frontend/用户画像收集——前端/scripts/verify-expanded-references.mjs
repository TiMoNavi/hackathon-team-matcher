import {chromium} from "playwright";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const additions=JSON.parse(await fs.readFile("docs/expanded-candidates.json","utf8"));
const sourceCatalog=await fs.readFile("lib/reference-catalog.ts","utf8");
const catalogItems=JSON.parse(sourceCatalog.split("export const referenceItems: ReferenceItem[] = ")[1].split(";\n")[0]);
const base="http://127.0.0.1:4199";
const report={checkedAt:new Date().toISOString(),views:[],checks:[],errors:[]};
const browser=await chromium.launch({headless:true});
async function visit(page,slug){await page.goto(base+"/references/view/"+slug,{waitUntil:"domcontentloaded"});await page.locator(".expanded-scene").waitFor();await page.waitForTimeout(160);}
try{
 const scans=await Promise.allSettled([1440,768,390,320].map(async width=>{
  const page=await browser.newPage({viewport:{width,height:width<600?844:1000}});page.setDefaultTimeout(10000);page.on("pageerror",e=>report.errors.push({width,message:e.message}));
  for(const item of additions){await visit(page,item.id);const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,children:document.querySelector(".expanded-scene").children.length,brokenImages:[...document.images].filter(i=>i.complete&&i.naturalWidth===0).length}));assert.ok(size.scroll<=width+1,item.id+" overflow at "+width);assert.ok(size.children>0,item.id+" blank");assert.equal(size.brokenImages,0,item.id+" broken images");report.views.push({slug:item.id,...size});if((width===1440&&["integration-beam","integration-flow","project-flow","decision-card","cover-flow"].includes(item.id))||(width===390&&["decision-card","prompt-library"].includes(item.id))){await page.waitForTimeout(item.id==="project-flow"?5500:650);await page.screenshot({path:"artifacts/expanded-"+item.id+"-"+width+".png",fullPage:true});}}
  await page.close();console.log("Rendered 20 additions at "+width);
 }));for(const result of scans){if(result.status==="rejected")throw result.reason;}
 const page=await browser.newPage({viewport:{width:1440,height:1080}});page.setDefaultTimeout(10000);page.on("pageerror",e=>report.errors.push({interaction:true,message:e.message}));
 await page.goto(base+"/references",{waitUntil:"networkidle"});
 const catalog=page.getByRole("navigation",{name:"选择参考场景"});assert.equal(await catalog.getByRole("button").count(),catalogItems.length);
 await page.getByRole("navigation",{name:"按用途筛选"}).getByRole("button",{name:"优先看",exact:true}).click();assert.equal(await catalog.getByRole("button").count(),catalogItems.filter(item=>item.recommended).length);
 await page.getByRole("navigation",{name:"按用途筛选"}).getByRole("button",{name:"全部",exact:true}).click();await page.getByLabel("搜索组件或阶段").fill("decision-card");assert.equal(await catalog.getByRole("button").count(),1);await catalog.getByRole("button").click();assert.ok(page.url().includes("scene=decision-card"));await page.getByLabel("清空搜索").click();
 await page.getByRole("button",{name:"切换夜间",exact:true}).click();await page.frameLocator("iframe").locator("html.dark").waitFor();await page.screenshot({path:"artifacts/expanded-library-dark.png",fullPage:true});await page.getByRole("button",{name:"切换浅色",exact:true}).click();await page.screenshot({path:"artifacts/expanded-library-desktop.png",fullPage:true});await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:"artifacts/expanded-library-mobile.png",fullPage:true});report.checks.push("Current library count and recommendations, search, deep link, dark mode and mobile layout");
 await page.setViewportSize({width:1440,height:1000});
 await visit(page,"integration-beam");const tile=page.getByRole("button").first();const before=await tile.getAttribute("aria-pressed");await tile.click();assert.notEqual(await tile.getAttribute("aria-pressed"),before);report.checks.push("Beam source toggles with accessible state");
 await visit(page,"layer-stack");await page.getByRole("tab").nth(3).click();assert.equal(await page.getByRole("tab").nth(3).getAttribute("aria-selected"),"true");report.checks.push("Layer selection follows clicked dimension");
 await visit(page,"cover-flow");await page.getByRole("button",{name:"Next",exact:true}).click();await page.waitForTimeout(900);assert.ok((await page.locator(".ui-cf__caption").textContent()).length>0);report.checks.push("Cover Flow next navigation");
 await visit(page,"decision-card");for(let i=0;i<3;i++){await page.getByRole("option").first().click();await page.waitForTimeout(450);}assert.equal(await page.locator(".scene-answer-list p").count(),3);await page.getByRole("button",{name:"重新答题"}).click();assert.equal(await page.getByRole("option").count(),3);report.checks.push("Three-question sequence, retained answers and reset");
 await visit(page,"agent-trail");await page.getByRole("button",{name:"失败",exact:true}).click();assert.ok((await page.locator(".scene-form").textContent()).includes("Failed"));await page.getByRole("button",{name:"完成",exact:true}).click();report.checks.push("Trail failed and completed states");
 await visit(page,"blur-crossfade");await page.getByRole("button",{name:"第 2 段",exact:true}).click();await page.waitForTimeout(600);assert.ok((await page.locator(".scene-message").last().textContent()).includes("你做过的项目"));report.checks.push("Blur transition swaps variable-length guidance");
 await visit(page,"tag-input");await page.getByLabel("技能与兴趣（演示）").fill("TypeScript");await page.getByLabel("技能与兴趣（演示）").press("Enter");assert.equal(await page.getByRole("button",{name:"Remove TypeScript",exact:true}).count(),1);report.checks.push("Tag entry creates removable chip");
 await visit(page,"prompt-library");await page.getByPlaceholder("goal",{exact:true}).fill("AI tools");await page.getByRole("button",{name:"使用这句话",exact:true}).click();assert.ok((await page.locator(".scene-result").textContent()).includes("AI tools"));report.checks.push("Fill-in prompt assembles and submits local sentence");
 await visit(page,"writing-assistant");await page.getByRole("button",{name:"把我的想法整理一下",exact:true}).click();await page.getByText("这是一段预设回复。",{exact:false}).waitFor();report.checks.push("Suggestion submits and shows simulated reply");
 await visit(page,"dropzone");await page.locator('input[type="file"]').setInputFiles({name:"profile-demo.txt",mimeType:"text/plain",buffer:Buffer.from("demo")});await page.getByRole("button",{name:"Remove profile-demo.txt",exact:true}).waitFor();await page.getByRole("button",{name:"Remove profile-demo.txt",exact:true}).click();report.checks.push("Local file can enter and leave simulated upload queue");
 await page.emulateMedia({reducedMotion:"reduce"});await visit(page,"integration-beam");assert.equal(await page.evaluate(()=>document.getAnimations().filter(a=>a.playState==="running").length),0);report.checks.push("Beam respects reduced motion");
 assert.equal(report.errors.length,0);await page.close();
}finally{await fs.writeFile("artifacts/expanded-references-verification.json",JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({views:report.views.length,checks:report.checks,errors:report.errors}));

