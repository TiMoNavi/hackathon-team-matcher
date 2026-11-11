#!/usr/bin/env node
'use strict';
// Real UI/database/API acceptance. Only GitHub's external transport uses fixed synthetic replies in the test router.
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {chromium}=require(process.env.MATCHER_PLAYWRIGHT_PATH||path.resolve(__dirname,'../../../../../.runtime/browser/node_modules/playwright'));
const [base,database]=process.argv.slice(2);const origin=new URL(base);
assert.equal(origin.hostname,'127.0.0.1');assert.equal(origin.protocol,'http:');assert.match(origin.port,/^(809[1-9]|81[0-9]{2})$/);assert.match(database||'',/^humhub_profile_s5_test_[a-z0-9_]+$/);
const backend=path.resolve(__dirname,'../../../../..');const runtime=path.join(backend,'.runtime/profile-s5',database);
const fixture=JSON.parse(fs.readFileSync(path.join(runtime,'browser-fixture.json'),'utf8'));
const samples=path.join(backend,'.runtime/s5-resume-fixtures');
const checks=[];const javascriptErrors=[];const serverErrors=[];const blockedOrigins=[];const apiTraffic=[];const screenshots=[];
const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);};
async function session(browser,id){
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==base){blockedOrigins.push(u.origin);return route.abort();}return route.continue();});
 context.on('response',response=>{const u=new URL(response.url());if(response.status()>=500)serverErrors.push({path:u.pathname,status:response.status()});if(u.pathname.startsWith('/api/v1/'))apiTraffic.push({method:response.request().method(),path:u.pathname,status:response.status()});});
 const page=await context.newPage();page.on('pageerror',e=>javascriptErrors.push(e.message));page.on('dialog',d=>d.accept());
 const login=await context.request.get(base+'/__s5_test/login?id='+id);assert.equal(login.status(),200);return{context,page,id,csrf:(await login.json()).csrf};
}
async function api(s,route){const response=await s.context.request.get(base+'/api/v1'+route);const body=await response.json();assert.ok(response.ok(),'GET '+route+' '+response.status());assert.ok(body.data&&body.meta);return body.data;}
async function sourceCount(s){const response=await s.context.request.get(base+'/__s5_test/github-count');return(await response.json()).requests;}
async function ready(page,stage){await page.locator('#matcher-onboarding').waitFor();await page.waitForFunction(()=>document.querySelector('#matcher-onboarding')?.getAttribute('aria-busy')==='false');if(stage)await page.waitForFunction(expected=>expected==='completed'?document.querySelector('[data-stage-panel="completed"]')?.hidden===false:document.querySelector('#matcher-onboarding')?.dataset.stage===expected,stage);}
async function errorFree(page){const box=page.locator('#onboarding-error');if(await box.isVisible())throw new Error(await box.textContent());}
async function click(s,selector,stage){await s.page.locator(selector).click();await ready(s.page,stage);await errorFree(s.page);}
async function flow(s,spaceId){await s.page.goto(base+'/matcher-onboarding/flow/index');await ready(s.page);await s.page.locator('#onboarding-space').selectOption(spaceId===null?'global':String(spaceId));await click(s,'#onboarding-start','materials');}
async function dto(s){const id=await s.page.locator('#matcher-onboarding').getAttribute('data-session-id');assert.ok(id);return api(s,'/onboarding/sessions/'+id);}
async function selectedSource(s){const id=await s.page.locator('.onboarding-source-detail').getAttribute('data-source-id');assert.ok(id);return api(s,'/me/profile/sources/'+id);}
async function upload(s,filename){await s.page.locator('#onboarding-resume-file').setInputFiles(path.join(samples,filename));await click(s,'[data-source-action="upload-resume"]','materials');return selectedSource(s);}
async function shot(s,name){const file=path.join(runtime,name+'.png');await s.page.screenshot({path:file,fullPage:true});const bytes=fs.readFileSync(file);screenshots.push({file:name+'.png',width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}
function field(profile,key){return(profile.attributes||[]).find(x=>x.key===key);}
async function finish(s){
 await click(s,'#onboarding-materials-next','review');await click(s,'#onboarding-review-confirm','questions');
 const current=await dto(s);check('question_batch_after_import_'+s.id,current.question_batch.questions.length>=3&&current.question_batch.questions.length<=8);
 for(const q of current.question_batch.questions){await click(s,'#onboarding-question-skip','questions');}
 await click(s,'#onboarding-synthesize','draft');check('imported_profile_rules_synthesis_'+s.id,(await dto(s)).llm_calls===0);
 await click(s,'#onboarding-draft-next','privacy');await click(s,'#onboarding-complete','completed');
 return dto(s);
}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.MATCHER_BROWSER_PATH||'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',headless:true});
 try{
  const gh=await session(browser,fixture.users.owner);const cv=await session(browser,fixture.users.viewer);const stranger=await session(browser,fixture.users.stranger);
  const caps=await api(gh,'/me/profile/source-capabilities');
  check('github_verified_native_link_detected',caps.readers.github.linked&&caps.readers.github.current_auth&&caps.readers.github.available);
  check('capability_check_does_not_fetch_github',await sourceCount(gh)===0);
  check('no_existing_github_source_for_new_owner',(await api(gh,'/me/profile/sources')).sources.length===0);
  await gh.page.goto(base+'/matcher-onboarding/flow/index');await ready(gh.page);
  check('page_browsing_does_not_import',await sourceCount(gh)===0);
  await gh.page.locator('#onboarding-space').selectOption(String(fixture.spaces[0]));await click(gh,'#onboarding-start','materials');
  let gsource=await selectedSource(gh);const gid=gsource.id;
  check('explicit_start_automatically_reads_verified_github',gsource.kind==='github'&&gsource.status==='ready'&&await sourceCount(gh)===4);
  check('github_login_needs_no_username_or_homepage_input',await gh.page.locator('input[name="github"],input[name="github_username"],input[name="github_url"]').count()===0&&(await gh.page.locator('#onboarding-sources').textContent()).includes('无需填写用户名或主页'));
  check('github_canonical_url_uses_verified_account',gsource.snapshot.canonical_url==='https://github.com/s5-github-'+gh.id);
  check('github_structured_readme_and_evidence_saved',gsource.snapshot.raw_text.includes('PRIVATE_GITHUB_README_MARKER_'+gh.id)&&gsource.snapshot.sections.every(x=>x.locator&&typeof x.locator==='object')&&gsource.snapshot.candidates.every(x=>x.evidence.length));
  check('personal_github_readme_included_independently',gsource.snapshot.raw_text.includes('PRIVATE_PROFILE_README_MARKER_'+gh.id)&&gsource.snapshot.metadata.profile_readme_present);
  check('github_import_does_not_publish_profile',(await api(gh,'/me/profile')).attributes.length===0);
  const denied=await cv.context.request.get(base+'/api/v1/me/profile/sources/'+gid);check('other_user_cannot_read_private_source',denied.status()===404);
  await gh.page.locator('#onboarding-headline').fill('S5 我的手填标题');await click(gh,'[data-source-action="apply-source"]','materials');
  let gs=await dto(gh);check('github_candidates_enter_existing_onboarding_draft',gs.input_drafts.global.preview_attributes.some(x=>x.key==='project')&&gs.input_drafts.global.preview_attributes.some(x=>x.key==='bio'));
  check('manual_input_survives_source_adoption',gs.input_drafts.global.preview_attributes.some(x=>x.key==='headline'&&x.value==='S5 我的手填标题'));
  await gh.page.reload();await ready(gh.page);await gh.page.locator('#onboarding-space').selectOption(String(fixture.spaces[0]));await click(gh,'#onboarding-start','materials');
  check('resume_existing_flow_does_not_refetch_github',await sourceCount(gh)===4);
  await click(gh,'[data-source-action="open-source"]','materials');
  await click(gh,'[data-source-action="refresh-source"]','materials');gsource=await selectedSource(gh);
  check('explicit_refresh_creates_next_source_version',gsource.id===gid&&gsource.version===2&&await sourceCount(gh)===8);
  await click(gh,'[data-source-action="apply-source"]','materials');
  await shot(gh,'s5-github-materials-desktop');
  gs=await finish(gh);check('github_import_reaches_confirmed_profile',gs.status==='completed'&&field(gs.profiles.global,'project')&&field(gs.profiles.global,'bio').value==='S5 GitHub 合成简介');
  const publicGh=await api(cv,'/spaces/'+fixture.spaces[0]+'/profiles/'+gh.id);check('github_raw_readme_not_in_public_profile',!JSON.stringify(publicGh).includes('PRIVATE_GITHUB_README_MARKER'));
  await click(gh,'#onboarding-restart','materials');await click(gh,'[data-source-action="open-source"]','materials');await click(gh,'[data-source-action="delete-source"]','materials');
  const deleted=await gh.context.request.get(base+'/api/v1/me/profile/sources/'+gid);check('delete_removes_private_source_snapshot',deleted.status()===404);
  check('delete_preserves_user_confirmed_profile',field(await api(gh,'/me/profile'),'bio').value==='S5 GitHub 合成简介');
  await gh.page.reload();await ready(gh.page);await gh.page.locator('#onboarding-space').selectOption(String(fixture.spaces[0]));await click(gh,'#onboarding-start','materials');
  check('deleted_source_is_not_automatically_fetched_again',await sourceCount(gh)===8);
  check('deleted_source_offers_explicit_reimport',await gh.page.locator('[data-source-action="import-github"]').isVisible());

  const cvCaps=await api(cv,'/me/profile/source-capabilities');check('unlinked_user_detected_without_external_request',!cvCaps.readers.github.linked&&await sourceCount(cv)===0);
  await flow(cv,fixture.spaces[0]);check('unconfigured_login_has_honest_resume_fallback',(await cv.page.locator('#onboarding-sources').textContent()).includes('尚未配置 GitHub 登录'));
  check('resume_plugin_available_without_github_link',cvCaps.readers.resume.available&&await cv.page.locator('#onboarding-resume-file').isVisible());
  const txt=await upload(cv,'synthetic.txt');check('txt_real_upload_parses_chinese_sections',txt.status==='ready'&&txt.snapshot.raw_text.includes('合成测试者')&&txt.snapshot.sections.length>0);
  check('txt_produces_experience_and_skill_candidates',['education','project','work_experience','skill'].every(key=>txt.snapshot.candidates.some(x=>x.key===key)));
  await cv.page.locator('.onboarding-source-text summary').click();check('owner_can_review_original_structured_text',await cv.page.locator('[data-source-raw-text]').isVisible());
  check('resume_import_is_not_profile_confirmation',(await api(cv,'/me/profile')).attributes.length===0);
  await click(cv,'[data-source-action="apply-source"]','materials');let cs=await dto(cv);const firstFields=cs.input_drafts.global.preview_attributes.length;
  check('resume_adoption_maps_into_same_profile_draft',firstFields>=6&&cs.input_drafts.global.preview_attributes.some(x=>x.key==='education'));
  const repeatedTxt=await upload(cv,'synthetic.txt');check('same_file_upload_reuses_source',repeatedTxt.id===txt.id&&repeatedTxt.version===txt.version);
  const docx=await upload(cv,'synthetic.docx');check('docx_real_upload_parses_document_xml',docx.status==='ready'&&docx.snapshot.raw_text.includes('合成协作工具'));
  await click(cv,'[data-source-action="apply-source"]','materials');check('matching_second_source_does_not_duplicate_fields',(await dto(cv)).input_drafts.global.preview_attributes.length===firstFields);
  const pdf=await upload(cv,'synthetic.pdf');check('pdf_real_upload_extracts_text_layer',pdf.status==='ready'&&pdf.snapshot.raw_text.includes('合成测试者'));
  const md=await upload(cv,'synthetic.md');check('markdown_real_upload_preserves_text',md.status==='ready'&&md.snapshot.raw_text.includes('合成简历'));
  check('four_document_sources_share_snapshot_contract',[txt,docx,pdf,md].every(x=>x.snapshot.sections.every(p=>p.id&&p.text&&p.locator)&&x.snapshot.candidates.every(c=>c.evidence.length)));
  const foreign=await stranger.context.request.get(base+'/api/v1/me/profile/sources/'+txt.id);check('stranger_cannot_read_resume_text',foreign.status()===404);
  const fail=await upload(cv,'broken.pdf');check('broken_pdf_keeps_explicit_failed_record',fail.status==='failed'&&fail.snapshot===null&&fail.last_job.error_code);
  check('failed_parse_shows_retry_control',await cv.page.locator('[data-source-action="refresh-source"]').isVisible());
  await cv.page.locator('[data-source-replacement]').setInputFiles(path.join(samples,'broken.pdf'));await click(cv,'[data-source-action="refresh-source"]','materials');
  const retried=await selectedSource(cv);check('failed_document_retry_advances_version',retried.id===fail.id&&retried.version>fail.version&&retried.status==='failed');
  await click(cv,'[data-source-action="delete-source"]','materials');check('failed_source_can_be_deleted',(await cv.context.request.get(base+'/api/v1/me/profile/sources/'+fail.id)).status()===404);
  await click(cv,'#onboarding-materials-next','review');
  check('imported_project_is_editable_in_review',await cv.page.locator('[data-stage-panel="review"] [data-field-key="project"] [data-property="project.title"]').inputValue()==='合成协作工具');
  const bio=cv.page.locator('[data-stage-panel="review"] [data-field-key="bio"]');await bio.locator('[data-visibility]').selectOption('private');
  await click(cv,'#onboarding-review-confirm','questions');cs=await dto(cv);
  check('review_explicitly_confirms_imported_experiences',field(cs.profiles.global,'education').value.school==='合成大学'&&field(cs.profiles.global,'bio').visibility==='private');
  for(const q of cs.question_batch.questions){await click(cv,'#onboarding-question-skip','questions');}
  await click(cv,'#onboarding-synthesize','draft');check('resume_import_continues_through_rules_synthesis',(await dto(cv)).llm_calls===0);
  await click(cv,'#onboarding-draft-next','privacy');await cv.page.locator('#onboarding-preview-perspective').selectOption('authenticated');await click(cv,'#onboarding-preview-refresh','privacy');
  check('imported_private_bio_respects_preview',await cv.page.locator('#onboarding-preview [data-preview-key="bio"]').count()===0);
  check('confirmed_experiences_appear_in_preview',await cv.page.locator('#onboarding-preview [data-preview-key="education"]').count()===1);
  await shot(cv,'s5-resume-privacy-desktop');await cv.page.setViewportSize({width:390,height:844});
  check('mobile_imported_profile_has_no_horizontal_overflow',await cv.page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
  await cv.page.locator('#onboarding-complete').focus();await cv.page.keyboard.press('Enter');await ready(cv.page,'completed');await errorFree(cv.page);
  cs=await dto(cv);check('resume_flow_finishes_with_real_confirmed_profile',cs.status==='completed'&&field(cs.profiles.global,'project').value.title==='合成协作工具');
  await shot(cv,'s5-resume-completed-mobile');
  const visible=await api(gh,'/spaces/'+fixture.spaces[0]+'/profiles/'+cv.id);check('actual_viewer_cannot_see_private_imported_bio',!JSON.stringify(visible).includes('喜欢把想法做成可以试用的工具'));
  check('source_raw_text_does_not_enter_public_projection',!JSON.stringify(visible).includes('raw_text')&&!JSON.stringify(visible).includes('snapshot'));
  check('sources_remain_private_after_profile_confirmation',(await stranger.context.request.get(base+'/api/v1/me/profile/sources/'+pdf.id)).status()===404);
  check('ordinary_profile_has_same_confirmed_education',field(await api(cv,'/me/profile'),'education').value.school==='合成大学');
  check('no_browser_javascript_errors',javascriptErrors.length===0);check('no_http_server_errors',serverErrors.length===0);check('browser_restricted_to_isolated_origin',blockedOrigins.length===0);
  const result={status:'passed',passed:checks.length,checks,javascript_errors:javascriptErrors.length,server_errors:serverErrors.length,blocked_origins:blockedOrigins,api_request_count:apiTraffic.length,
   screenshots,environment:{kind:'isolated_s5_clone',browser:'Microsoft Edge Chromium via Playwright',origin:base,desktop:[1280,900],mobile:[390,844]},
   boundaries:{github_oauth_callback:'not exercised; native verified associations created through native service in isolated fixture',github_external_http:'fixed server-side adapter only; separate live public API smoke validates transport',document_conversion:'real TXT/MD/DOCX/PDF parsers and real multipart uploads',browser_api_mocking:false,llm_calls:0}};
  fs.writeFileSync(path.join(runtime,'browser-last-run.json'),JSON.stringify(result,null,2)+'\n');process.stdout.write(JSON.stringify(result,null,2)+'\n');
 }finally{await browser.close();}
})().catch(error=>{process.stderr.write(JSON.stringify({status:'failed',message:error.message,stack:error.stack,javascriptErrors,serverErrors,blockedOrigins,completed_checks:checks},null,2)+'\n');process.exitCode=1;});
