/* Run against a fresh synthetic S3 owner on an isolated loopback test server. */
const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium} = require(process.env.MATCHER_PLAYWRIGHT_PATH || path.resolve(__dirname, '../../../../../.runtime/browser/node_modules/playwright'));
const [base, ownerText, firstSpace, secondSpace] = process.argv.slice(2);
const withPrivacy = process.argv.includes('--privacy');
const withLegacy = process.argv.includes('--legacy');
assert.match(base, /^http:\/\/127\.0\.0\.1:(809[1-9]|81[0-9]{2})$/);
assert.ok([ownerText, firstSpace, secondSpace].every(x => /^[1-9][0-9]*$/.test(x)));
assert.notEqual(firstSpace, secondSpace);
const checks = [];
const check = (name, result) => { assert.ok(result, name); checks.push(name); };
let page;

(async () => {
    const browser = await chromium.launch({headless: true, executablePath: process.env.MATCHER_BROWSER_PATH || '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'});
    try {
        page = await browser.newPage({viewport: {width: 1280, height: 900}});
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        page.on('dialog', dialog => dialog.accept());
        await page.goto(base + '/__s3_test/login?id=' + ownerText);
        const response = await page.goto(base + '/matcher-user-profile/editor/index');
        check('editor_page_200', response.status() === 200);
        const root = page.locator('#matcher-profile-editor');
        async function ready() {
            await root.waitFor();
            await page.waitForFunction(() => document.querySelector('#matcher-profile-editor')?.getAttribute('aria-busy') === 'false');
        }
        async function click(id) { await page.locator(id).click(); await ready(); }
        async function api(method, route, body) {
            const csrf = await page.locator('meta[name="csrf-token"]').getAttribute('content');
            const response = await page.request.fetch(base + '/api/v1' + route, {method, headers: {'X-CSRF-Token': csrf, 'Content-Type': 'application/json', 'Idempotency-Key': require('node:crypto').randomUUID()}, ...(body === undefined ? {} : {data: body})});
            const result = await response.json();
            assert.ok(response.ok(), method + ' ' + route + ' ' + JSON.stringify(result.error));
            return result.data;
        }
        async function add(key) { await page.locator('[data-add-field="' + key + '"]').click(); return page.locator('[data-field-key="' + key + '"]').last(); }
        const property = (card, key) => card.locator('[data-property="' + key + '"]');
        async function save() { await click('#matcher-draft-save'); check('draft_save_no_error_' + checks.length, await page.locator('#matcher-editor-error').isHidden()); }
        async function chooseScope(id) { await page.locator('#matcher-profile-scope').selectOption(id); await page.waitForFunction(scope => document.querySelector('#matcher-profile-editor')?.dataset.loadedScope === scope, id); await ready(); }
        await ready();
        check('global_catalog_has_27_fields', await page.locator('[data-definition-key]').count() === 27);
        check('formal_space_options', await page.locator('#matcher-profile-scope option').count() === 3);
        const initialProfile = await api('GET', '/me/profile');
        check('legacy_section_matches_owner_candidates', await page.locator('[data-adopt-legacy]').count() === initialProfile.legacy_candidates.length && (initialProfile.legacy_candidates.length ? await page.locator('#matcher-editor-legacy').isVisible() : await page.locator('#matcher-editor-legacy').isHidden()));
        if (withLegacy) { check('unconfirmed_native_name_uses_neutral_header', (await page.locator('h1').first().textContent()).trim().startsWith('成员·') && (await api('GET', '/me')).nickname === null); }

        let card = await add('personality'); await property(card, 'personality.traits').fill('耐心\n喜欢明确分工');
        await property(card, 'personality.self_description').fill('我习惯先整理思路，再和队友讨论。');
        card = await add('communication_preference'); await property(card, 'communication_preference.free_text').fill('长期习惯异步沟通');
        card = await add('contact_wechat'); await property(card, 'contact_wechat').fill('s3_optional_wechat');
        card = await add('skill'); await property(card, 'skill.label').fill('Python'); if (withPrivacy) { await card.locator('[data-visibility]').selectOption('friends'); }
        card = await add('bio'); await property(card, 'bio').fill('合成简介'); if (withPrivacy) { await card.locator('[data-visibility]').selectOption('private'); }
        card = await add('project'); await property(card, 'project.title').fill('合成项目甲'); await property(card, 'project.contribution').fill('负责后端设计');
        card = await add('project'); await property(card, 'project.title').fill('合成项目乙'); await property(card, 'project.contribution').fill('负责交互设计');
        await save();
        let profile = await api('GET', '/me/profile'), draft = await api('GET', '/me/profile/drafts/' + profile.editing_draft.id);
        check('draft_has_seven_pending_operations', draft.fields.length === 7);
        check('save_does_not_confirm_profile', !profile.attributes.some(x => x.key === 'contact_wechat'));
        check('draft_selection_defaults_empty', await page.locator('[data-confirm-id]:checked').count() === 0);
        const projectA = draft.preview_attributes.find(x => x.key === 'project' && x.value.title === '合成项目甲');
        const projectB = draft.preview_attributes.find(x => x.key === 'project' && x.value.title === '合成项目乙');
        const wechat = draft.preview_attributes.find(x => x.key === 'contact_wechat');
        check('repeatable_items_have_distinct_ids', projectA.attribute_id !== projectB.attribute_id);
        if (withPrivacy) {
            await page.locator('#matcher-preview-perspective').selectOption('authenticated'); await click('#matcher-preview-refresh');
            check('draft_preview_simulates_pending_contact', await page.locator('[data-preview-key="contact_wechat"]').count() === 1);
            check('draft_preview_respects_proposed_ranges', await page.locator('[data-preview-key="bio"],[data-preview-key="skill"]').count() === 0);
            check('draft_preview_does_not_publish_candidates', (await api('GET', '/me/profile')).attributes.length === 0);
        }
        await page.reload(); await ready();
        check('reload_restores_seven_pending_items', await page.locator('[data-confirm-id]').count() === 7);
        check('reload_keeps_wechat_value', await page.locator('[data-property="contact_wechat"]').inputValue() === 's3_optional_wechat');
        await page.locator('#matcher-nickname').fill('尚未确认的昵称');
        for (const id of [projectA.attribute_id, wechat.attribute_id]) { await page.locator('[data-confirm-id="' + id + '"]').check(); }
        await click('#matcher-draft-confirm');
        profile = await api('GET', '/me/profile');
        check('partial_confirmation_saves_only_selected', profile.attributes.length === 2 && profile.attributes.some(x => x.attribute_id === projectA.attribute_id));
        check('partial_confirmation_retains_other_five', await page.locator('[data-confirm-id]').count() === 5);
        check('ordinary_confirmation_preserves_unconfirmed_identity_input', await page.locator('#matcher-nickname').inputValue() === '尚未确认的昵称' && (await api('GET', '/me')).nickname === null);
        card = page.locator('[data-record-id="' + projectB.attribute_id + '"]');
        await property(card, 'project.contribution').fill('负责交互设计与验收'); await card.locator('[data-move="up"]').click();
        await save();
        profile = await api('GET', '/me/profile'); draft = await api('GET', '/me/profile/drafts/' + profile.editing_draft.id);
        check('project_edit_preserves_stable_id', draft.preview_attributes.some(x => x.attribute_id === projectB.attribute_id && x.value.contribution === '负责交互设计与验收'));
        check('project_order_changes_independently', draft.preview_attributes.findIndex(x => x.attribute_id === projectB.attribute_id) < draft.preview_attributes.findIndex(x => x.attribute_id === projectA.attribute_id));
        await click('#matcher-draft-select-all'); await click('#matcher-draft-confirm');
        profile = await api('GET', '/me/profile');
        check('full_confirmation_finishes_remaining_draft', profile.attributes.length === 7 && !profile.editing_draft);
        if (withPrivacy) { check('saved_friend_and_private_ranges', profile.attributes.find(x => x.key === 'skill').visibility === 'friends' && profile.attributes.find(x => x.key === 'bio').visibility === 'private'); }

        if (withPrivacy) {
            await page.locator('#matcher-preview-perspective').selectOption('authenticated'); await click('#matcher-preview-refresh');
            check('authenticated_preview_omits_private_and_friend_fields', await page.locator('[data-preview-key="bio"],[data-preview-key="skill"]').count() === 0);
            check('authenticated_preview_shows_optional_contact', await page.locator('[data-preview-key="contact_wechat"]').count() === 1);
            await page.locator('#matcher-preview-perspective').selectOption('friends'); await click('#matcher-preview-refresh');
            check('friend_preview_adds_friend_field', await page.locator('[data-preview-key="skill"]').count() === 1 && await page.locator('[data-preview-key="bio"]').count() === 0);
            await page.locator('#matcher-preview-perspective').selectOption('owner'); await click('#matcher-preview-refresh');
            check('owner_preview_includes_private_field', await page.locator('[data-preview-key="bio"]').count() === 1);
        }
        await click('#matcher-identity-save');
        check('identity_requires_its_own_explicit_confirmation', (await api('GET', '/me')).nickname === '尚未确认的昵称');
        await chooseScope('space:' + firstSpace);
        check('space_catalog_has_ten_fields', await page.locator('[data-definition-key]').count() === 10);
        check('space_hides_global_identity_editor', await page.locator('#matcher-editor-identity').isHidden());
        card = await add('event_goal'); await property(card, 'event_goal.free_text').fill('第一个 Space 完成演示');
        card = await add('event_time_commitment'); await property(card, 'event_time_commitment.hours_min').fill('8'); await property(card, 'event_time_commitment.hours_max').fill('12'); await property(card, 'event_time_commitment.period').selectOption('event');
        await save(); await click('#matcher-draft-select-all'); await click('#matcher-draft-confirm');
        await chooseScope('space:' + secondSpace);
        check('new_space_starts_empty', await page.locator('[data-field-key]').count() === 0);
        card = await add('event_goal'); await property(card, 'event_goal.free_text').fill('第二个 Space 寻找长期伙伴');
        await save(); await click('#matcher-draft-select-all'); await click('#matcher-draft-confirm');
        await chooseScope('space:' + firstSpace);
        check('first_space_retains_own_goal', await page.locator('[data-property="event_goal.free_text"]').inputValue() === '第一个 Space 完成演示');
        await chooseScope('global');
        check('global_habit_survives_space_switch', await page.locator('[data-property="communication_preference.free_text"]').inputValue() === '长期习惯异步沟通');

        const image = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 120; const g = c.getContext('2d'); g.fillStyle = '#116688'; g.fillRect(0, 0, 120, 120); return c.toDataURL('image/png').split(',')[1]; }), 'base64');
        const initialIdentity = await api('GET', '/me');
        await page.locator('#matcher-avatar-file').setInputFiles({name: 'synthetic-avatar.png', mimeType: 'image/png', buffer: image}); await ready();
        check('avatar_upload_is_only_candidate', (await api('GET', '/me')).identity_version === initialIdentity.identity_version);
        await page.locator('#matcher-nickname').fill('合成资料验收'); await click('#matcher-identity-save');
        const identity = await api('GET', '/me');
        check('identity_confirmation_saves_nickname_and_avatar', identity.nickname === '合成资料验收' && !!identity.avatar_ref && identity.identity_version === initialIdentity.identity_version + 1);
        card = await add('contact_wechat_qr'); await property(card, 'contact_wechat_qr.file_ref').setInputFiles({name: 'synthetic-qr.png', mimeType: 'image/png', buffer: image}); await ready();
        await property(card, 'contact_wechat_qr.label').fill('合成二维码'); await save();
        profile = await api('GET', '/me/profile');
        check('qr_draft_stays_unconfirmed', !profile.attributes.some(x => x.key === 'contact_wechat_qr'));
        await click('#matcher-draft-select-all'); await click('#matcher-draft-confirm');
        profile = await api('GET', '/me/profile');
        check('qr_confirmation_keeps_uploaded_reference', profile.attributes.some(x => x.key === 'contact_wechat_qr' && x.value.file_ref.startsWith('mpr_')));

        await page.locator('[data-record-id="' + projectA.attribute_id + '"] [data-delete-record]').click();
        await save(); await click('#matcher-draft-select-all'); await click('#matcher-draft-confirm');
        profile = await api('GET', '/me/profile');
        check('explicit_delete_preserves_other_project', !profile.attributes.some(x => x.attribute_id === projectA.attribute_id) && profile.attributes.some(x => x.attribute_id === projectB.attribute_id));

        await page.locator('[data-property="contact_wechat"]').fill('local_unsaved_after_conflict');
        const externalDraft = await api('POST', '/me/profile/drafts', {scope: 'global', base_profile_version: profile.revision});
        const changedDraft = await api('PUT', '/me/profile/drafts/' + externalDraft.id, {expected_version: externalDraft.draft_version, fields: [{key: 'headline', value: '另一个页面已确认'}]});
        await api('POST', '/me/profile/drafts/' + externalDraft.id + '/confirm', {expected_version: changedDraft.draft_version, base_revision: changedDraft.base_revision, confirmation_intent: 'confirm'});
        await click('#matcher-draft-save');
        check('concurrent_change_surfaces_conflict', await page.locator('#matcher-editor-error').isVisible() && (await page.locator('#matcher-editor-status').textContent()).includes('版本冲突'));
        check('conflict_preserves_local_input', await page.locator('[data-property="contact_wechat"]').inputValue() === 'local_unsaved_after_conflict');
        profile = await api('GET', '/me/profile');
        check('conflict_does_not_overwrite_confirmed_data', profile.attributes.find(x => x.key === 'contact_wechat').value === 's3_optional_wechat' && profile.attributes.find(x => x.key === 'headline').value === '另一个页面已确认');
        await click('#matcher-editor-reload');
        check('explicit_reload_recovers_latest_revision', await page.locator('[data-property="contact_wechat"]').inputValue() === 's3_optional_wechat');
        if (withLegacy) {
            await page.locator('[data-adopt-legacy="real_name"]').click();
            check('legacy_adoption_prefills_owner_review', await page.locator('[data-property="real_name"]').inputValue() === '合成旧姓名');
            await page.locator('[data-field-key="real_name"] [data-visibility]').selectOption('authenticated');
            await save();
            check('legacy_save_remains_unconfirmed', !(await api('GET', '/me/profile')).attributes.some(x => x.key === 'real_name'));
            await click('#matcher-draft-select-all'); await click('#matcher-draft-confirm');
            check('legacy_owner_confirmation_publishes_selected_range', (await api('GET', '/me/profile')).attributes.some(x => x.key === 'real_name' && x.value === '合成旧姓名' && x.visibility === 'authenticated'));
        }
        await page.setViewportSize({width: 390, height: 844});
        check('mobile_editor_has_no_horizontal_overflow', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
        check('no_browser_runtime_errors', errors.length === 0);
        console.log(JSON.stringify({status: 'passed', privacy_preview_tested: withPrivacy, legacy_adoption_tested: withLegacy, passed: checks.length, checks}));
    } finally { await browser.close(); }
})().catch(error => { console.error(JSON.stringify({status: 'failed', completed_checks: checks, error: error.message, stack: error.stack})); process.exit(1); });
