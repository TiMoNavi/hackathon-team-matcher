// Local S1 native-page check. Credentials and page contents stay in process memory.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const { chromium } = require(path.join(root, '.runtime/browser/node_modules/playwright'));
const credentials = JSON.parse(fs.readFileSync(path.join(root, '.runtime/preview-credentials.json'), 'utf8'));
const base = 'http://127.0.0.1:8090';
const report = {scope: 'S1 local native profile and module pages', checks: [], javascript_error_count: 0};
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
        const profile = await page.goto(base + '/user/account/edit', {waitUntil: 'networkidle'});
        check('native_profile_edit_returns_200', profile.status() === 200);
        // HumHub's legacy HForm leaves maxlength unset; limits are verified server-side.
        check('headline_input_available', await page.locator('input[name="Profile[title]"]').count() === 1);
        for (const field of ['firstname', 'lastname']) {
            const input = page.locator('input[name="Profile[' + field + ']"]');
            check(field + '_input_available', await input.count() === 1);
            check(field + '_is_optional', await input.getAttribute('required') === null);
        }
        check('new_fields_wait_for_controlled_editor', await page.locator('[name*="Profile[matcher_"]').count() === 0);
        const modules = await page.goto(base + '/admin/module/list', {waitUntil: 'networkidle'});
        check('module_admin_returns_200', modules.status() === 200);
        check('profile_module_listed', (await page.locator('body').innerText()).includes('团队匹配用户资料'));
        check('native_pages_have_no_javascript_errors', report.javascript_error_count === 0);
        report.status = report.checks.every(item => item.passed) ? 'passed' : 'failed';
        console.log(JSON.stringify(report, null, 2));
        if (report.status !== 'passed') process.exitCode = 1;
    } finally {
        await browser.close();
    }
})().catch(() => {
    console.error(JSON.stringify({status: 'failed', phase: 'native_browser_check'}));
    process.exitCode = 1;
});
