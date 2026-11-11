// Read-only local preview smoke. Credentials and profile values stay in process memory.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const { chromium } = require(path.join(root, '.runtime/browser/node_modules/playwright'));
const credentials = JSON.parse(fs.readFileSync(path.join(root, '.runtime/preview-credentials.json'), 'utf8'));
const base = 'http://127.0.0.1:8090';
const report = {scope: 'S5B local preview read-only backend APIs and existing preview pages', checks: [], javascript_error_count: 0, native_navigation_confirmations: 0};
const check = (name, passed) => report.checks.push({name, passed: !!passed});
(async () => {
  const browser = await chromium.launch({executablePath: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true, args: ['--disable-gpu']});
  try {
    const page = await browser.newPage();
    page.on('pageerror', () => report.javascript_error_count++);
    page.on('dialog', async dialog => { if (['confirm', 'beforeunload'].includes(dialog.type())) { report.native_navigation_confirmations++; await dialog.accept(); } else { await dialog.dismiss(); } });
    await page.goto(base, {waitUntil: 'networkidle'});
    await page.locator('input[name="Login[username]"]').fill(credentials.admin_username);
    await page.locator('form').filter({has: page.locator('input[name="Login[username]"]')}).locator('button[type="submit"]').click();
    await page.locator('input[type="password"]').fill(credentials.admin_password);
    await Promise.all([page.waitForURL(/dashboard/), page.locator('form').filter({has: page.locator('input[type="password"]')}).locator('button[type="submit"]').click()]);
    check('native_login_reaches_dashboard', new URL(page.url()).pathname.includes('dashboard'));
    let response = await page.goto(base + '/user/account/edit', {waitUntil: 'networkidle'});
    check('native_profile_edit_200', response.status() === 200);
    check('native_profile_version_token_present', await page.locator('input[name="matcher_profile_revision"]').count() === 1);
    check('native_identity_version_token_present', await page.locator('input[name="matcher_identity_version"]').count() === 1);
    for (const field of ['firstname', 'lastname']) {
      check(field + '_remains_optional', await page.locator('input[name="Profile[' + field + ']"]').getAttribute('required') === null);
    }
    response = await page.goto(base + '/user/account/edit-settings', {waitUntil: 'networkidle'});
    check('native_settings_200', response.status() === 200);
    check('native_timezone_has_profile_version_token', await page.locator('input[name="matcher_profile_revision"]').count() === 1);
    for (const suffix of ['', '/about']) {
      response = await page.goto(base + '/u/' + encodeURIComponent(credentials.admin_username) + suffix, {waitUntil: 'networkidle'});
      check(suffix ? 'native_about_200' : 'native_profile_stream_200', response.status() === 200);
    }
    const api = await page.context().request.get(base + '/api/v1/me/profile');
    check('profile_api_200', api.status() === 200);
    const body = await api.json();
    check('profile_api_envelope', !!body.meta?.request_id && !!body.data);
    check('profile_api_catalog_v2', body.data.schema_version === 2 && body.data.field_definitions.length === 27);
    check('all_contact_fields_available_and_optional', body.data.field_definitions.filter(x => x.key.startsWith('contact_')).length === 6 && body.data.field_definitions.every(x => x.required_when.length === 0));
    check('profile_api_private_no_store', api.headers()['cache-control'].includes('no-store'));
    const identity = await page.context().request.get(base + '/api/v1/me');
    check('identity_api_200', identity.status() === 200);
    check('identity_version_is_numeric', Number.isInteger((await identity.json()).data.identity_version));
    response = await page.goto(base + '/matcher-user-profile/editor/index', {waitUntil: 'networkidle'});
    check('ordinary_editor_page_200', response.status() === 200);
    await page.waitForFunction(() => document.querySelector('#matcher-profile-editor')?.getAttribute('aria-busy') === 'false');
    check('ordinary_editor_global_catalog_complete', await page.locator('[data-definition-key]').count() === 27);
    check('ordinary_editor_has_three_preview_perspectives', await page.locator('#matcher-preview-perspective option').count() === 3);
    check('ordinary_editor_navigation_present', await page.getByRole('link', {name: '团队协作资料', exact: true}).count() > 0);
    check('ordinary_editor_has_no_error', await page.locator('#matcher-editor-error').isHidden());
    for (const perspective of ['owner', 'authenticated', 'friends']) {
      const preview = await page.context().request.get(base + '/api/v1/me/profile/preview?perspective=' + perspective);
      check(perspective + '_preview_200', preview.status() === 200);
      const previewBody = await preview.json();
      check(perspective + '_preview_is_simulated_and_private', previewBody.data?.simulated === true && previewBody.data?.perspective === perspective && preview.headers()['cache-control'].includes('no-store'));
    }
    const contacts = await page.context().request.get(base + '/api/v1/me/contacts');
    check('own_contacts_endpoint_200', contacts.status() === 200);
    const contactsBody = await contacts.json();
    check('own_contacts_separate_projection', Array.isArray(contactsBody.data?.attributes) && contactsBody.data.attributes.every(item => item.key.startsWith('contact_')));
    response = await page.goto(base + '/user/account/edit', {waitUntil: 'networkidle'});
    const flowLink = page.getByRole('link', {name: '画像填写引导', exact: true});
    check('native_account_menu_exposes_onboarding', await flowLink.count() > 0);
    let onboardingWrites = 0;
    page.on('request', request => { if (request.method() !== 'GET' && request.url().includes('/api/v1/onboarding/')) onboardingWrites++; });
    await flowLink.first().click();
    await page.waitForURL(url => url.pathname.endsWith('/matcher-onboarding/flow/index'));
    await page.waitForFunction(() => document.querySelector('#matcher-onboarding')?.getAttribute('aria-busy') === 'false');
    check('native_menu_click_opens_onboarding', new URL(page.url()).pathname.endsWith('/matcher-onboarding/flow/index'));
    check('onboarding_has_five_steps', await page.locator('#matcher-onboarding [data-step]').count() === 5);
    check('onboarding_offers_global_and_valid_space_options', await page.locator('#onboarding-space option[value="global"]').count() === 1 && await page.locator('#onboarding-space option').count() >= 1);
    check('onboarding_start_is_explicit', await page.locator('#onboarding-start').isEnabled() && await page.locator('#onboarding-workspace').isHidden());
    check('onboarding_browse_does_not_create_session', onboardingWrites === 0);
    check('onboarding_page_has_no_error', await page.locator('#onboarding-error').isHidden());
    const sourceCapabilities = await page.context().request.get(base + '/api/v1/me/profile/source-capabilities');
    check('source_capabilities_200', sourceCapabilities.status() === 200);
    const sourceData = (await sourceCapabilities.json()).data;
    check('all_four_source_kinds_enabled', ['github', 'resume', 'web', 'text'].every(kind => sourceData.readers[kind].enabled));
    check('web_and_text_readers_available', sourceData.readers.web.available && sourceData.readers.text.available);
    check('web_declares_self_ownership_only', sourceData.readers.web.ownership_basis === 'self_declared' && sourceData.readers.text.ownership_basis === 'self_declared');
    check('web_network_budget_visible', sourceData.readers.web.total_timeout_ms === 15000 && sourceData.readers.web.max_download_bytes === 1048576);
    check('all_sources_remain_rule_based', sourceData.llm_calls === 0 && ['web', 'text'].every(kind => sourceData.readers[kind].llm_calls === 0));
    check('resume_parser_available', sourceData.readers.resume.available);
    check('source_status_exposes_no_secrets', !JSON.stringify(sourceData).match(/clientSecret|access_token|clientId/));
    report.github_oauth_configured = sourceData.readers.github.configured;
    report.current_account_github_linked = sourceData.readers.github.linked;
    const savedSources = await page.context().request.get(base + '/api/v1/me/profile/sources');
    check('sources_list_200_private_no_store', savedSources.status() === 200 && savedSources.headers()['cache-control'].includes('no-store'));
    check('source_list_has_no_original_text', (await savedSources.json()).data.sources.every(source => source.snapshot === null));
    const unauthenticated = await browser.newContext();
    const denied = await unauthenticated.request.get(base + '/api/v1/me/profile');
    check('anonymous_profile_api_401', denied.status() === 401);
    for (const endpoint of ['/api/v1/me/profile/preview', '/api/v1/me/contacts', '/api/v1/me/profile/sources', '/api/v1/onboarding/sessions/00000000-0000-4000-8000-000000000000']) {
      const privacyDenied = await unauthenticated.request.get(base + endpoint);
      check('anonymous_' + endpoint + '_401', privacyDenied.status() === 401);
    }
    await unauthenticated.close();
    check('native_pages_have_no_javascript_errors', report.javascript_error_count === 0);
    report.status = report.checks.every(x => x.passed) ? 'passed' : 'failed';
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== 'passed') process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(() => { console.error(JSON.stringify({status: 'failed', phase: 'native_browser_check', checks_completed: report.checks.length, checks: report.checks})); process.exitCode = 1; });
