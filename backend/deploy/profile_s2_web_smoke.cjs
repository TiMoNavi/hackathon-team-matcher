// Read-only local preview smoke. Credentials and profile values stay in process memory.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const { chromium } = require(path.join(root, '.runtime/browser/node_modules/playwright'));
const credentials = JSON.parse(fs.readFileSync(path.join(root, '.runtime/preview-credentials.json'), 'utf8'));
const base = 'http://127.0.0.1:8090';
const report = {scope: 'S2 local preview read-only API and native pages', checks: [], javascript_error_count: 0};
const check = (name, passed) => report.checks.push({name, passed: !!passed});
(async () => {
  const browser = await chromium.launch({executablePath: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', headless: true, args: ['--disable-gpu']});
  try {
    const page = await browser.newPage();
    page.on('pageerror', () => report.javascript_error_count++);
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
    const unauthenticated = await browser.newContext();
    const denied = await unauthenticated.request.get(base + '/api/v1/me/profile');
    check('anonymous_profile_api_401', denied.status() === 401);
    await unauthenticated.close();
    check('native_pages_have_no_javascript_errors', report.javascript_error_count === 0);
    report.status = report.checks.every(x => x.passed) ? 'passed' : 'failed';
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== 'passed') process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(() => { console.error(JSON.stringify({status: 'failed', phase: 'native_browser_check', checks_completed: report.checks.length})); process.exitCode = 1; });
