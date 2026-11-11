// Run against a local preview. Set PLAYWRIGHT_MODULE / CHROMIUM_EXECUTABLE if needed.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({headless:true, ...(process.env.CHROMIUM_EXECUTABLE ? {executablePath:process.env.CHROMIUM_EXECUTABLE} : {})});
const page = await browser.newPage({viewport:{width:1440,height:1000}});
const results = { checks: [], errors: [], fonts: {}, widths: [] };
page.on('pageerror',e=>results.errors.push(e.message));
page.setDefaultTimeout(10000);
const check=(name,passed,detail)=>{results.checks.push({name,passed,detail});if(!passed)throw new Error(name+' failed: '+JSON.stringify(detail));};
const wait=ms=>page.waitForTimeout(ms);
mkdirSync('docs/screenshots',{recursive:true});
try {
  await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4200/',{waitUntil:'networkidle',timeout:120000});
  await page.getByRole('button',{name:'切换为连续浏览',exact:true}).click();
  await page.evaluate(()=>document.fonts.ready);
  await wait(1200);
  check('Five sections in requested order',JSON.stringify(await page.locator('main>section').evaluateAll(nodes=>nodes.map(n=>n.id)))===JSON.stringify(['top','people','profile','recommendations','community']));
  const lightSurfaces=await page.evaluate(()=>['#community','#demo-event','[aria-label="AI 推荐理由"]'].map(selector=>{const color=getComputedStyle(document.querySelector(selector)).backgroundColor;const rgb=color.match(/[0-9.]+/g).slice(0,3).map(Number);return {selector,color,light:Math.min(...rgb)>220};}));
  check('Community, activity and AI reasons use light surfaces',lightSurfaces.every(s=>s.light),lightSurfaces);
  check('Reference-library collision beams are active',await page.locator('.hero-light-beam').count()>0);
  const client=await page.context().newCDPSession(page);await client.send('DOM.enable');await client.send('CSS.enable');
  await page.evaluate(()=>{for(const [id,text,font] of [['font-test-heading','Team Matcher','var(--font-heading)'],['font-test-body','Developer profile','var(--font-sans)'],['font-test-chinese','你的下一个队友，也在找你。','var(--font-sans)']]){const s=document.createElement('span');s.id=id;s.textContent=text;s.style.cssText='position:fixed;left:0;top:0;font-size:20px;z-index:-1;font-family:'+font;document.body.append(s);}});
  await page.evaluate(()=>document.fonts.ready);
  const doc=await client.send('DOM.getDocument');
  for(const id of ['font-test-heading','font-test-body','font-test-chinese']){const {nodeId}=await client.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#'+id});results.fonts[id]=(await client.send('CSS.getPlatformFontsForNode',{nodeId})).fonts;}
  check('Bricolage Grotesque actually renders',results.fonts['font-test-heading'].some(f=>f.familyName.includes('Bricolage')&&f.isCustomFont));
  check('Inter actually renders',results.fonts['font-test-body'].some(f=>f.familyName==='Inter'&&f.isCustomFont));
  check('Chinese glyphs render in a CJK font',results.fonts['font-test-chinese'].some(f=>/PingFang|Heiti|Microsoft|Noto|Source Han/.test(f.familyName)));
  await page.evaluate(()=>document.querySelectorAll('[id^="font-test-"]').forEach(e=>e.remove()));
  const transform=()=>page.locator('.hero-lane-track').first().evaluate(e=>getComputedStyle(e).transform);
  const moving=await transform();await page.waitForFunction(before=>getComputedStyle(document.querySelector('.hero-lane-track')).transform!==before,moving,{polling:50,timeout:4000});check('Hero marquee moves',moving!==await transform());
  await page.getByRole('button',{name:'暂停页面动画',exact:true}).click();await wait(100);
  await page.locator('.hero-lane-track').first().evaluate(e=>Promise.all(e.getAnimations().map(a=>a.ready)));
  const stopped=await transform();await wait(250);const pausedTransform=await transform();check('Global pause stops marquee',stopped===pausedTransform,{before:stopped,after:pausedTransform});
  const decoration=()=>page.evaluate(()=>({floor:document.querySelector('.hero-aurora .ui-gf-layer--color path')?.getAttribute('d'),gradient:getComputedStyle(document.querySelector('.hero-title .ui-gt__fill')).backgroundPosition,glow:getComputedStyle(document.querySelector('.hero-glow')).transform}));
  const frozen=await decoration();await wait(220);check('Pause freezes light field and gradient text',JSON.stringify(frozen)===JSON.stringify(await decoration()));
  check('Paused title stays fully readable',await page.locator('.hero-title .ui-trv__p').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).opacity==='1')));
  check('Global pause stops collision beam loops',await page.locator('.hero-light-beam').count()===0);
  await page.locator('#people').scrollIntoViewIfNeeded();await wait(250);
  const wheelState=()=>page.locator('.people-role-wheel .ui-mw-row').evaluateAll(nodes=>nodes.map(n=>n.style.transform));const wheelStopped=await wheelState();await wait(200);check('Global pause freezes the role wheel',JSON.stringify(wheelStopped)===JSON.stringify(await wheelState()));
  await page.getByRole('button',{name:'认识一下林小满',exact:true}).first().click();
  await page.getByRole('dialog').waitFor({state:'visible'});
  check('Person detail opens',await page.getByRole('dialog').isVisible());
  await page.getByRole('button',{name:'对这位队友感兴趣',exact:true}).click();check('Person interaction stays a demo',await page.getByText('已在当前预览中标记，未发送好友申请。').isVisible());
  await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});check('Escape closes detail',await page.getByRole('dialog').count()===0);
  await page.getByRole('button',{name:'查看个人简历示例画像',exact:true}).click();check('Profile source switches',await page.getByRole('button',{name:'查看个人简历示例画像',exact:true}).getAttribute('aria-pressed')==='true');
  const orbit=()=>page.locator('.profile-orbit__ring--outer').evaluate(e=>getComputedStyle(e).transform);const stillOrbit=await orbit();await wait(160);check('Global pause freezes profile orbit',stillOrbit===await orbit());
  await page.getByRole('button',{name:'预览并确认',exact:true}).click();await page.getByRole('dialog').waitFor({state:'visible'});check('Profile preview opens',await page.getByRole('dialog').isVisible());
  await page.getByRole('dialog').getByRole('button',{name:/确认/}).click();check('Profile confirmation is explicit',await page.getByRole('dialog').getByText(/已确认/).count()>0);await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  const current=()=>page.locator('#recommendations h3').first().innerText();const before=await current();
  await page.getByRole('button',{name:'下一位队友',exact:true}).click();await wait(350);check('Recommendation changes card and reasons',before!==await current());
  const recCard=page.locator('#recommendations [role="group"][tabindex="0"]');await recCard.focus();await page.keyboard.press('ArrowRight');await wait(350);check('Recommendation keyboard works',before!==await current());
  await page.locator('#community').scrollIntoViewIfNeeded();
  const input=page.getByRole('textbox',{name:'输入演示消息'});await input.fill('我负责前端，一起把 Demo 做出来。');await page.getByRole('button',{name:'发送演示消息',exact:true}).click();check('User can send a local chat message',await page.getByText('我负责前端，一起把 Demo 做出来。',{exact:true}).isVisible());
  await page.getByRole('button',{name:'让 AI 理清下一步',exact:true}).click();check('AI demo gives a visible response',await page.locator('#community [role="log"]').innerText().then(t=>t.includes('AI')));
  await page.getByRole('button',{name:'体验加入活动',exact:true}).click();check('Event join is visibly a demo',await page.getByRole('button',{name:/已体验加入/}).isVisible());
  await page.getByRole('button',{name:/已体验加入/}).click();
  await page.getByRole('button',{name:'播放页面动画',exact:true}).click();
  await page.locator('#people').scrollIntoViewIfNeeded();await page.mouse.move(0,0);const roleBefore=await page.locator('.people-role-wheel .ui-mw-row[data-active]').innerText();await page.waitForFunction(before=>document.querySelector('.people-role-wheel .ui-mw-row[data-active]')?.textContent.trim()!==before,roleBefore.trim(),{polling:100,timeout:8000});check('Reference-library role wheel advances',roleBefore!==await page.locator('.people-role-wheel .ui-mw-row[data-active]').innerText());
  await page.locator('#profile').scrollIntoViewIfNeeded();await wait(300);const orbitMoving=await orbit();await page.waitForFunction(before=>getComputedStyle(document.querySelector('.profile-orbit__ring--outer')).transform!==before,orbitMoving,{polling:50,timeout:4000});check('Profile orbit resumes',orbitMoving!==await orbit());
  await page.getByRole('button',{name:'查看作品网站示例画像',exact:true}).click();check('Profile swap starts a crossfade',await page.locator('#profile .ui-bx').getAttribute('data-busy')!==null);await wait(650);check('Profile crossfade releases size lock',await page.locator('#profile .ui-bx').getAttribute('data-busy')===null);
  await page.locator('#recommendations').scrollIntoViewIfNeeded();await wait(400);const tilt=page.locator('.recommendation-tilt');const tiltBox=await tilt.boundingBox();await page.mouse.move(tiltBox.x+tiltBox.width*.8,tiltBox.y+tiltBox.height*.3);await page.waitForFunction(()=>parseFloat(document.querySelector('.recommendation-tilt .ui-tc-card').style.getPropertyValue('--ry'))>0,{},{polling:50,timeout:4000});check('Recommendation card responds to pointer',await tilt.locator('.ui-tc-card').evaluate(e=>parseFloat(e.style.getPropertyValue('--ry'))>0));await page.mouse.move(0,0);
  for(const width of [1440,768,390,320]){
    await page.evaluate(()=>document.activeElement instanceof HTMLElement && document.activeElement.blur());await page.setViewportSize({width,height:width<600?844:1000});await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await wait(500);
    const sizes=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));results.widths.push(sizes);check('No horizontal overflow at '+width,sizes.document===sizes.viewport,sizes);
    await page.screenshot({path:'docs/screenshots/'+width+'-hero.png'});
    for(const id of ['people','profile','recommendations','community']){await page.locator('#'+id).scrollIntoViewIfNeeded();await wait(280);if(width===1440||width===390)await page.locator('#'+id).screenshot({path:'docs/screenshots/'+width+'-'+id+'.png'});}
    await page.screenshot({path:'docs/screenshots/'+width+'-full.png',fullPage:true});
  }
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  await page.getByRole('button',{name:'打开导航',exact:true}).click();check('Mobile navigation opens',await page.getByRole('button',{name:'收起导航',exact:true}).isVisible());
  await page.getByRole('navigation').getByRole('link',{name:'一起开工',exact:true}).click();check('Mobile navigation closes after selection',await page.getByRole('button',{name:'打开导航',exact:true}).isVisible());
  await page.getByRole('button',{name:'返回演示会话列表',exact:true}).click();await page.locator('#community').getByRole('button',{name:/开源小花园/}).click();
  check('Mobile chat switches rooms',await page.locator('#community [role="log"]').getAttribute('aria-label').then(t=>t.includes('开源小花园')));
  await input.fill('另一个想法也很有意思。');await page.getByRole('button',{name:'发送演示消息',exact:true}).click();check('Mobile input works',await page.getByText('另一个想法也很有意思。',{exact:true}).isVisible());
  await page.emulateMedia({reducedMotion:'reduce'});await page.reload({waitUntil:'networkidle'});await wait(600);
  check('System reduced motion respected',await page.evaluate(()=>document.documentElement.dataset.motion==='paused'));
  check('Reduced motion disables new background effects',await page.locator('.hero-light-beam').count()===0);
  check('No page runtime errors',results.errors.length===0,results.errors);
  const broken=await page.locator('img').evaluateAll(nodes=>nodes.filter(n=>n.complete&&n.naturalWidth===0).map(n=>n.src));check('No broken loaded images',broken.length===0,broken);
  results.passed=true;
} catch(e) { results.passed=false;results.failure=e.stack; console.error(e.stack); }
finally {writeFileSync('docs/verification.json',JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));await browser.close();}
if(!results.passed)process.exit(1);
