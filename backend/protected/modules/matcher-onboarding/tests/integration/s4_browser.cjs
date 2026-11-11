#!/usr/bin/env node
'use strict';

// Independent real-page acceptance. No API response is mocked.
// Usage: node s4_browser.cjs http://127.0.0.1:8097 humhub_profile_s4_test_... [fixture.json]
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {isDeepStrictEqual} = require('node:util');
const {chromium} = require(process.env.MATCHER_PLAYWRIGHT_PATH || path.resolve(__dirname, '../../../../../.runtime/browser/node_modules/playwright'));
const [base, database, fixtureArgument] = process.argv.slice(2);
const origin = new URL(base);
assert.equal(origin.protocol, 'http:');
assert.equal(origin.hostname, '127.0.0.1');
assert.match(origin.port, /^(809[6-9]|81[0-9]{2})$/);
assert.equal(base, origin.origin);
assert.match(database || '', /^humhub_profile_s4_test_[a-z0-9_]+$/);
const backend = path.resolve(__dirname, '../../../../..');
const runtime = path.join(backend, '.runtime/profile-s4', database);
const fixturePath = fixtureArgument ? path.resolve(fixtureArgument) : path.join(runtime, 'browser-fixture.json');
assert.ok(fixturePath.startsWith(runtime + path.sep), 'Use only the named isolated runtime fixture');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
assert.ok(fixture.users && fixture.spaces?.length >= 2, 'Synthetic owner/viewer and two Spaces are required');
assert.notEqual(String(fixture.spaces[0]), String(fixture.spaces[1]));
const checks = [];
const javascriptErrors = [];
const serverErrors = [];
const blockedOrigins = [];
const apiTraffic = [];
const check = (name, condition) => { assert.ok(condition, name); checks.push(name); };

async function newSession(browser, userId, viewport = {width: 1280, height: 900}) {
    assert.ok(Number.isInteger(Number(userId)) && Number(userId) > 0);
    const context = await browser.newContext({viewport});
    await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== base) { blockedOrigins.push(url.origin); return route.abort(); }
        return route.continue();
    });
    context.on('response', response => {
        const url = new URL(response.url());
        if (response.status() >= 500) serverErrors.push({path: url.pathname, status: response.status()});
        if (url.pathname.startsWith('/api/v1/')) apiTraffic.push({method: response.request().method(), path: url.pathname, status: response.status()});
    });
    const page = await context.newPage();
    page.on('pageerror', error => javascriptErrors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    const response = await page.goto(base + '/__s4_test/login?id=' + userId);
    assert.equal(response.status(), 200, 'Synthetic test login');
    const login = await response.json();
    return {context, page, csrf: login.csrf};
}

async function readApi(context, route) {
    const response = await context.request.get(base + '/api/v1' + route);
    const body = await response.json();
    assert.ok(response.ok(), 'Read assertion failed: ' + route + ' (' + response.status() + ')');
    assert.ok(body.meta?.request_id && body.data, 'API envelope');
    return body.data;
}

async function writeApi(session, method, route, body) {
    const response = await session.context.request.fetch(base + '/api/v1' + route, {
        method,
        headers: {'X-CSRF-Token': session.csrf, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID()},
        data: body,
    });
    const result = await response.json();
    assert.ok(response.ok(), method + ' ' + route + ' (' + response.status() + '): ' + (result.error?.code || 'unknown'));
    assert.ok(result.meta?.request_id && result.data, 'Write envelope');
    return result.data;
}

async function currentSession(session) {
    const id = await session.page.locator('#matcher-onboarding').getAttribute('data-session-id');
    assert.ok(id, 'The page identifies its active server session');
    return readApi(session.context, '/onboarding/sessions/' + id);
}

async function ready(page, stage) {
    const root = page.locator('#matcher-onboarding');
    await root.waitFor();
    await page.waitForFunction(() => document.querySelector('#matcher-onboarding')?.getAttribute('aria-busy') === 'false');
    if (stage) await page.waitForFunction(value => value === 'completed' ? document.querySelector('[data-stage-panel="completed"]')?.hidden === false : document.querySelector('#matcher-onboarding')?.dataset.stage === value, stage);
}

function assertRules(name, value) {
    check(name + '_rules_mode', value.generation_mode === 'rules');
    check(name + '_zero_model_calls', value.llm_calls === 0);
}

function attribute(profile, key) { return profile.attributes.find(item => item.key === key); }

async function seedOwner(session) {
    // Arrange a previously confirmed project and a separate unfinished ordinary draft.
    let draft = await writeApi(session, 'POST', '/me/profile/drafts', {scope: 'global'});
    draft = await writeApi(session, 'PUT', '/me/profile/drafts/' + draft.id, {expected_version: draft.draft_version, fields: [
        {key: 'project', value: {title: 'S4 合成既有项目', contribution: '负责接口实现'}, visibility: 'authenticated'},
        {key: 'contact_wechat', value: 'synthetic_s4_wechat', visibility: 'friends'},
    ]});
    await writeApi(session, 'POST', '/me/profile/drafts/' + draft.id + '/confirm', {expected_version: draft.draft_version, base_revision: draft.base_revision, confirmation_intent: 'confirm'});
    let pending = await writeApi(session, 'POST', '/me/profile/drafts', {scope: 'global'});
    pending = await writeApi(session, 'PUT', '/me/profile/drafts/' + pending.id, {expected_version: pending.draft_version, fields: [
        {key: 'headline', value: 'S4 普通编辑尚未确认内容'},
    ]});
    return {pending, profile: await readApi(session.context, '/me/profile')};
}

const panel = (page, stage) => page.locator('[data-stage-panel="' + stage + '"]');
const card = (page, stage, key) => panel(page, stage).locator('[data-field-key="' + key + '"]');
const property = (record, key) => record.locator('[data-property="' + key + '"]');

async function clickFlow(page, selector, stage) {
    await page.locator(selector).click();
    await ready(page, stage);
}

async function openFlow(session, spaceId = null) {
    const response = await session.page.goto(base + '/matcher-onboarding/flow/index');
    assert.equal(response.status(), 200, 'Onboarding page loads');
    await ready(session.page);
    const wanted = spaceId === null ? 'global' : String(spaceId);
    const options = await session.page.locator('#onboarding-space option').evaluateAll(items => items.map(x => x.value));
    const choice = options.includes(wanted) ? wanted : 'space:' + wanted;
    assert.ok(options.includes(choice), 'Only choose a rendered formal Space');
    await session.page.locator('#onboarding-space').selectOption(choice);
    await clickFlow(session.page, '#onboarding-start');
    return currentSession(session);
}

async function continueMaterials(session) {
    await clickFlow(session.page, '#onboarding-materials-next', 'review');
    await clickFlow(session.page, '#onboarding-review-confirm', 'questions');
    const dto = await currentSession(session);
    assert.ok(dto.question_batch?.questions?.length >= 3 && dto.question_batch.questions.length <= 8);
    return dto;
}

async function answerShown(session, question, answer = {type: 'skipped'}) {
    const page = session.page;
    const body = page.locator('#onboarding-question-body');
    if (answer.type === 'skipped') { await clickFlow(page, '#onboarding-question-skip', 'questions'); return; }
    const inputs = body.locator('input[type="checkbox"],input[type="radio"]');
    if (question.mode === 'multiple') {
        for (const element of await inputs.all()) { if (await element.isChecked()) await element.uncheck(); }
    }
    const free = body.locator('textarea');
    if (await free.count()) await free.fill(answer.text || '');
    for (const code of answer.codes || []) { await body.locator('input[value="' + code + '"]').check(); }
    await clickFlow(page, '#onboarding-question-next', 'questions');
}

async function answerBatch(session, choose) {
    const dto = await currentSession(session);
    const questions = dto.question_batch.questions;
    for (let index = Number(dto.resource_refs.question_index || 0); index < questions.length; index++) {
        const question = questions[index];
        await answerShown(session, question, choose(question, index));
    }
    return currentSession(session);
}

async function synthesize(session, label) {
    await clickFlow(session.page, '#onboarding-synthesize', 'draft');
    const dto = await currentSession(session);
    assertRules('synthesis_' + label, dto);
    return dto;
}

async function finish(session) {
    await clickFlow(session.page, '#onboarding-draft-next', 'privacy');
    await clickFlow(session.page, '#onboarding-complete', 'completed');
    const dto = await currentSession(session);
    assert.equal(dto.status, 'completed');
    return dto;
}

async function runScenario(browser) {
    const owner = await newSession(browser, fixture.users.owner);
    const viewer = await newSession(browser, fixture.users.viewer);
    const stranger = await newSession(browser, fixture.users.stranger);
    const {page} = owner;
    const baseline = await seedOwner(owner);
    const [firstSpace, secondSpace] = fixture.spaces;
    let dto = await openFlow(owner, firstSpace);
    check('formal_space_session_created', dto.space_id === Number(firstSpace) && dto.stage === 'materials');
    check('materials_panel_visible', await panel(page, 'materials').isVisible());
    assertRules('new_session', dto);
    check('five_stages_present', await page.locator('#onboarding-steps [data-step]').count() === 5);
    check('existing_project_loaded_from_ordinary_profile', (await page.locator('#onboarding-existing-summary').innerText()).includes('本人确认资料') && dto.profiles.global.attributes.some(a => a.key === 'project' && a.value.title === 'S4 合成既有项目'));
    check('ordinary_pending_headline_not_silently_imported', await page.locator('#onboarding-headline').inputValue() !== 'S4 普通编辑尚未确认内容');
    await page.locator('#onboarding-headline').fill('S4 喜欢把想法做成工具的开发者');
    await page.locator('#onboarding-bio').fill('S4 我做过合成项目，希望一起完成清晰的小目标。');
    await clickFlow(page, '#onboarding-materials-save', 'materials');
    check('material_save_stays_unconfirmed', !attribute(await readApi(owner.context, '/me/profile'), 'bio'));
    await page.reload(); await ready(page);
    if (!await page.locator('#onboarding-workspace').isVisible()) await clickFlow(page, '#onboarding-start', 'materials');
    check('materials_reload_restores_saved_input', await page.locator('#onboarding-bio').inputValue() === 'S4 我做过合成项目，希望一起完成清晰的小目标。');
    await clickFlow(page, '#onboarding-materials-next', 'review');
    check('review_includes_existing_project', await card(page, 'review', 'project').count() > 0);
    check('review_preserves_existing_friend_contact', await card(page, 'review', 'contact_wechat').locator('[data-visibility]').inputValue() === 'friends');
    await clickFlow(page, '#onboarding-review-confirm', 'questions');
    dto = await currentSession(owner);
    const firstBatchId = dto.question_batch.id;
    const questions = dto.question_batch.questions;
    check('batch_contains_three_to_eight_questions', questions.length >= 3 && questions.length <= 8);
    check('saved_questions_have_stable_ids_and_reasons', questions.every(q => q.id && q.template_id && q.reason && q.options.every(x => x.code && x.label)));
    assertRules('prepared_batch', dto.question_batch);
    check('review_confirmation_reaches_ordinary_profile', attribute(await readApi(owner.context, '/me/profile'), 'headline').value === 'S4 喜欢把想法做成工具的开发者');
    for (const [name, route] of [
        ['session', '/onboarding/sessions/' + dto.id],
        ['batch', '/me/profile/question-batches/' + firstBatchId],
        ['draft', '/me/profile/drafts/' + dto.input_drafts.global.id],
    ]) {
        const denied = await viewer.context.request.get(base + '/api/v1' + route);
        check('other_user_cannot_read_' + name, [403, 404].includes(denied.status()));
    }
    const first = questions[0];
    await answerShown(owner, first, {type: 'options', codes: [first.options[0].code]});
    check('previous_button_enabled_after_answer', !await page.locator('#onboarding-question-previous').isDisabled());
    await clickFlow(page, '#onboarding-question-previous', 'questions');
    check('previous_question_restores_selected_option', await page.locator('#onboarding-question-body input[value="' + first.options[0].code + '"]').isChecked());
    await answerShown(owner, first, {type: 'free_text', text: 'S4 第一 Space 完成一个可演示工具'});
    let batch = await readApi(owner.context, '/me/profile/question-batches/' + firstBatchId);
    check('return_edit_versions_answer_and_keeps_batch', batch.answers.find(a => a.question_id === first.id)?.version === 2 && batch.id === firstBatchId);
    await page.locator('#onboarding-save-exit').click();
    await page.waitForURL(url => url.pathname.endsWith('/matcher-user-profile/editor/index'));
    dto = await openFlow(owner, firstSpace);
    check('save_exit_resumes_batch_and_position', dto.question_batch.id === firstBatchId && dto.resource_refs.question_index === 1);
    await answerBatch(owner, q => {
        if (q.target_key === 'communication_preference') return {type: 'options', codes: [q.options[0].code], text: 'S4 长期习惯异步沟通并记录决定'};
        if (q.target_key === 'event_role') return {type: 'skipped'};
        if (q.target_key === 'role') return {type: 'options', codes: q.options.slice(0, 2).map(x => x.code)};
        return {type: 'options', codes: [q.options[0].code]};
    });
    batch = await readApi(owner.context, '/me/profile/question-batches/' + firstBatchId);
    check('all_question_answers_persisted', batch.answers.length === questions.length);
    check('multiple_choice_answer_persisted', batch.answers.some(a => a.selected_options?.length === 2));
    check('explicit_skip_persisted', batch.answers.some(a => a.answer_type === 'skipped'));
    check('free_text_answer_persisted', batch.answers.some(a => a.answer_type === 'free_text' && a.free_text === 'S4 第一 Space 完成一个可演示工具'));
    check('option_answer_keeps_free_supplement', batch.answers.some(a => a.answer_type === 'options' && a.free_text === 'S4 长期习惯异步沟通并记录决定' && a.selected_options.includes('async')));
    check('single_choice_question_was_exercised', questions.some(q => q.mode === 'single' && batch.answers.some(a => a.question_id === q.id && a.selected_options.length === 1)));
    dto = await synthesize(owner, 'first_space');
    check('synthesis_keeps_existing_confirmed_project', dto.output_drafts.global.preview_attributes.some(a => a.key === 'project' && a.value.title === 'S4 合成既有项目'));
    check('synthesis_does_not_publish_answers', !attribute(await readApi(owner.context, '/me/profile'), 'communication_preference'));
    await property(card(page, 'draft', 'bio'), 'bio').fill('S4 本人最后编辑的私有介绍');
    await clickFlow(page, '#onboarding-draft-save', 'draft');
    check('draft_edit_saved_before_confirmation', (await currentSession(owner)).output_drafts.global.preview_attributes.some(a => a.key === 'bio' && a.value === 'S4 本人最后编辑的私有介绍'));
    const beforeReturn = await currentSession(owner);
    await clickFlow(page, '[data-step="questions"]', 'questions');
    const returnedQuestions = await currentSession(owner);
    check('return_to_questions_keeps_saved_answers', returnedQuestions.question_batch.id === beforeReturn.question_batch.id && returnedQuestions.question_batch.version === beforeReturn.question_batch.version);
    await clickFlow(page, '#onboarding-synthesize', 'draft');
    const reusedDraft = await currentSession(owner);
    check('unchanged_answers_reopen_existing_drafts', reusedDraft.stage === 'draft' && reusedDraft.output_drafts.global.id === beforeReturn.output_drafts.global.id && reusedDraft.output_drafts.space.id === beforeReturn.output_drafts.space.id);
    check('resynthesis_keeps_saved_draft_versions', reusedDraft.output_drafts.global.draft_version === beforeReturn.output_drafts.global.draft_version && reusedDraft.output_drafts.space.draft_version === beforeReturn.output_drafts.space.draft_version);
    check('resynthesis_keeps_user_edited_text', reusedDraft.output_drafts.global.preview_attributes.some(a => a.key === 'bio' && a.value === 'S4 本人最后编辑的私有介绍') && await property(card(page, 'draft', 'bio'), 'bio').inputValue() === 'S4 本人最后编辑的私有介绍');
    await page.screenshot({path: path.join(runtime, 's4-resynthesis-draft.png'), fullPage: true});
    await panel(page, 'draft').locator('[data-add-picker="global"]').selectOption('project');
    await panel(page, 'draft').locator('[data-add-record="global"]').click();
    let extraProject = card(page, 'draft', 'project').last();
    await property(extraProject, 'project.title').fill('S4 新增后删除的合成项目');
    await property(extraProject, 'project.contribution').fill('检查独立条目编辑');
    await clickFlow(page, '#onboarding-draft-save', 'draft');
    check('draft_supports_additional_project_record', (await currentSession(owner)).output_drafts.global.preview_attributes.filter(a => a.key === 'project').length === 2);
    extraProject = card(page, 'draft', 'project').last();
    await extraProject.locator('[data-delete-field]').click();
    await clickFlow(page, '#onboarding-draft-save', 'draft');
    const remainingProjects = (await currentSession(owner)).output_drafts.global.preview_attributes.filter(a => a.key === 'project');
    check('draft_delete_preserves_other_project', remainingProjects.length === 1 && remainingProjects[0].value.title === 'S4 合成既有项目');
    await clickFlow(page, '#onboarding-draft-next', 'privacy');
    await card(page, 'privacy', 'bio').locator('[data-visibility]').selectOption('private');
    await card(page, 'privacy', 'communication_preference').locator('[data-visibility]').selectOption('friends');
    await page.locator('#onboarding-preview-perspective').selectOption('authenticated');
    await clickFlow(page, '#onboarding-preview-refresh', 'privacy');
    let preview = await page.locator('#onboarding-preview').innerText();
    check('authenticated_preview_hides_private_and_friends_values', !preview.includes('S4 本人最后编辑的私有介绍') && !preview.includes('S4 长期习惯异步沟通并记录决定') && !preview.includes('synthetic_s4_wechat'));
    check('authenticated_preview_keeps_confirmed_public_project', preview.includes('S4 合成既有项目'));
    await page.locator('#onboarding-preview-perspective').selectOption('friends'); await clickFlow(page, '#onboarding-preview-refresh', 'privacy');
    preview = await page.locator('#onboarding-preview').innerText();
    check('friends_preview_adds_friend_fields_and_contacts', preview.includes('S4 长期习惯异步沟通并记录决定') && preview.includes('synthetic_s4_wechat') && !preview.includes('S4 本人最后编辑的私有介绍'));
    await page.locator('#onboarding-preview-perspective').selectOption('owner'); await clickFlow(page, '#onboarding-preview-refresh', 'privacy');
    check('owner_preview_includes_private_draft', (await page.locator('#onboarding-preview').innerText()).includes('S4 本人最后编辑的私有介绍'));
    const ownerPreview = await page.locator('#onboarding-preview').innerText();
    check('preference_codes_render_as_chinese_labels', ownerPreview.includes('文字异步沟通') && ownerPreview.includes('先明确分工') && !ownerPreview.includes('async') && !ownerPreview.includes('clear_roles'));
    await page.screenshot({path: path.join(runtime, 's4-privacy-desktop.png'), fullPage: true});
    check('preview_does_not_publish_private_draft', attribute(await readApi(owner.context, '/me/profile'), 'bio').value !== 'S4 本人最后编辑的私有介绍');
    await page.setViewportSize({width: 390, height: 844});
    check('mobile_privacy_has_no_horizontal_overflow', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.locator('#onboarding-complete').focus(); await page.keyboard.press('Enter'); await ready(page, 'completed');
    dto = await currentSession(owner);
    check('keyboard_completion_saves_session', dto.status === 'completed' && dto.completed_at);
    const finalGlobal = await readApi(owner.context, '/me/profile');
    const finalFirst = await readApi(owner.context, '/me/profile?scope=space&space_id=' + firstSpace);
    check('confirmed_privacy_ranges_persist', attribute(finalGlobal, 'bio').visibility === 'private' && attribute(finalGlobal, 'communication_preference').visibility === 'friends');
    const visitor = await readApi(viewer.context, '/spaces/' + firstSpace + '/profiles/' + fixture.users.owner);
    check('actual_space_visitor_cannot_read_private_or_friend_fields', !attribute(visitor.global, 'bio') && !attribute(visitor.global, 'communication_preference') && attribute(visitor.global, 'project').value.title === 'S4 合成既有项目');
    const visitorContacts = await readApi(viewer.context, '/spaces/' + firstSpace + '/profiles/' + fixture.users.owner + '/contacts');
    check('actual_space_visitor_cannot_read_friend_contact', !attribute(visitorContacts, 'contact_wechat'));
    check('global_habit_has_no_space_scope', !!attribute(finalGlobal, 'communication_preference') && !attribute(finalFirst, 'communication_preference'));
    check('first_space_goal_saved_separately', attribute(finalFirst, 'event_goal').value.free_text === 'S4 第一 Space 完成一个可演示工具');
    const pendingAfter = await readApi(owner.context, '/me/profile/drafts/' + baseline.pending.id);
    check('ordinary_manual_draft_preserved', pendingAfter.draft_version === baseline.pending.draft_version && isDeepStrictEqual(pendingAfter.fields, baseline.pending.fields));
    await fs.promises.mkdir(runtime, {recursive: true});
    await page.screenshot({path: path.join(runtime, 's4-completed-mobile.png'), fullPage: true});
    await page.locator('#onboarding-open-profile').click();
    await page.waitForFunction(() => document.querySelector('#matcher-profile-editor')?.getAttribute('aria-busy') === 'false');
    check('ordinary_editor_reads_same_confirmed_bio', await page.locator('[data-property="bio"]').inputValue() === 'S4 本人最后编辑的私有介绍');
    check('ordinary_editor_reads_same_confirmed_global_habit', await page.locator('[data-property="communication_preference.free_text"]').inputValue() === 'S4 长期习惯异步沟通并记录决定');

    await page.setViewportSize({width: 1280, height: 900});
    await openFlow(owner, secondSpace);
    check('new_space_keeps_global_introduction', await page.locator('#onboarding-bio').inputValue() === 'S4 本人最后编辑的私有介绍');
    dto = await continueMaterials(owner);
    check('new_space_starts_with_empty_context', dto.profiles.space.attributes.length === 0);
    await answerBatch(owner, q => q.target_key === 'event_goal' ? {type: 'options', codes: [q.options[0].code], text: 'S4 第二 Space 寻找长期伙伴'} : {type: 'skipped'});
    await synthesize(owner, 'second_space');
    await clickFlow(page, '#onboarding-draft-next', 'privacy');
    const spacePreview = await page.locator('#onboarding-preview').innerText();
    check('space_goal_code_renders_as_chinese_label', spacePreview.includes('完成一个可展示原型') && !spacePreview.includes('prototype'));
    await clickFlow(page, '#onboarding-complete', 'completed');
    const second = await readApi(owner.context, '/me/profile?scope=space&space_id=' + secondSpace);
    check('second_space_gets_its_own_goal', attribute(second, 'event_goal').value.free_text === 'S4 第二 Space 寻找长期伙伴');
    check('first_space_goal_survives_second_completion', attribute(await readApi(owner.context, '/me/profile?scope=space&space_id=' + firstSpace), 'event_goal').value.free_text === 'S4 第一 Space 完成一个可演示工具');
    check('global_habit_survives_second_completion', attribute(await readApi(owner.context, '/me/profile'), 'communication_preference').value.free_text === 'S4 长期习惯异步沟通并记录决定');

    await openFlow(viewer); await continueMaterials(viewer);
    await answerBatch(viewer, () => ({type: 'skipped'}));
    dto = await synthesize(viewer, 'empty_global');
    check('all_skipped_answers_produce_no_invented_facts', dto.output_drafts.global.fields.length === 0);
    await finish(viewer);
    check('all_optional_global_flow_can_finish_empty', (await readApi(viewer.context, '/me/profile')).attributes.length === 0);

    await openFlow(stranger);
    await stranger.page.locator('#onboarding-headline').fill('S4 冲突前已确认的介绍');
    await continueMaterials(stranger); await answerBatch(stranger, () => ({type: 'skipped'})); await synthesize(stranger, 'conflict_global');
    await property(card(stranger.page, 'draft', 'headline'), 'headline').fill('S4 引导页尚未保存的输入');
    const externalHeadline = attribute(await readApi(stranger.context, '/me/profile'), 'headline');
    let external = await writeApi(stranger, 'POST', '/me/profile/drafts', {scope: 'global'});
    external = await writeApi(stranger, 'PUT', '/me/profile/drafts/' + external.id, {expected_version: external.draft_version, fields: [{attribute_id: externalHeadline.attribute_id, key: 'headline', value: 'S4 另一个页面已确认的新介绍'}]});
    await writeApi(stranger, 'POST', '/me/profile/drafts/' + external.id + '/confirm', {expected_version: external.draft_version, base_revision: external.base_revision, confirmation_intent: 'confirm'});
    await clickFlow(stranger.page, '#onboarding-draft-save', 'draft');
    check('parallel_edit_surfaces_conflict', await stranger.page.locator('#onboarding-error').isVisible());
    check('parallel_edit_keeps_local_input', await property(card(stranger.page, 'draft', 'headline'), 'headline').inputValue() === 'S4 引导页尚未保存的输入');
    check('parallel_edit_does_not_overwrite_new_confirmed_value', attribute(await readApi(stranger.context, '/me/profile'), 'headline').value === 'S4 另一个页面已确认的新介绍');
    await clickFlow(stranger.page, '#onboarding-reconcile', 'review');
    check('explicit_reconcile_reads_latest_confirmed_profile', await property(card(stranger.page, 'review', 'headline'), 'headline').inputValue() === 'S4 另一个页面已确认的新介绍');
    await stranger.page.screenshot({path: path.join(runtime, 's4-reconcile-desktop.png'), fullPage: true});
    check('no_ai_endpoints_called_by_browser', apiTraffic.every(item => !item.path.includes('/ai/') && !item.path.includes('/ai-jobs')));
    for (const session of [owner, viewer, stranger]) await session.context.close();
}

(async () => {
    const browser = await chromium.launch({headless: true, executablePath: process.env.MATCHER_BROWSER_PATH || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'});
    try {
        await runScenario(browser);
        check('no_external_or_main_preview_requests', blockedOrigins.length === 0);
        check('no_browser_javascript_errors', javascriptErrors.length === 0);
        check('no_server_500s', serverErrors.length === 0);
        console.log(JSON.stringify({status: 'passed', passed: checks.length, checks, javascript_errors: javascriptErrors.length, server_errors: serverErrors.length, blocked_origins: blockedOrigins, api_request_count: apiTraffic.length}));
    } finally { await browser.close(); }
})().catch(error => {
    console.error(JSON.stringify({status: 'failed', completed_checks: checks, error: error.message, javascript_errors: javascriptErrors, server_errors: serverErrors, blocked_origins: blockedOrigins}));
    process.exitCode = 1;
});
