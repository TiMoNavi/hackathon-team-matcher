/* Real native upload -> crop -> delete regression on an isolated loopback test server. */
const assert = require('node:assert/strict');
const {chromium} = require(process.env.MATCHER_PLAYWRIGHT_PATH || 'playwright');
const base = process.argv[2];
const owner = Number(process.argv[3]);
assert.match(base, /^http:\/\/127\.0\.0\.1:[0-9]+$/);
assert.ok(Number.isSafeInteger(owner) && owner > 0);
const checks = [];
const check = (label, result) => { assert.ok(result, label); checks.push(label); };

(async () => {
    const browser = await chromium.launch({headless: true, ...(process.env.MATCHER_BROWSER_PATH ? {executablePath: process.env.MATCHER_BROWSER_PATH} : {})});
    try {
        const page = await browser.newPage();
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.goto(base + '/__s2_test/login?id=' + owner);
        const response = await page.goto(base + '/user/account/edit');
        check('native_account_page', response.status() === 200);
        const input = 'input[type=file][data-upload-url*="/user/image/upload"]';
        await page.waitForFunction(selector => !!jQuery(selector).data('blueimp-fileupload'), input);
        const before = Number(await page.locator('input[name=matcher_identity_version]').inputValue());
        const image = Buffer.from(await page.evaluate(() => {
            const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 400;
            const context = canvas.getContext('2d'); context.fillStyle = '#1da090'; context.fillRect(0, 0, 600, 400);
            return canvas.toDataURL().split(',')[1];
        }), 'base64');
        const uploaded = page.waitForResponse(response => response.url().includes('/user/image/upload') && response.request().method() === 'POST');
        await page.locator(input).setInputFiles({name: 'synthetic-avatar.png', mimeType: 'image/png', buffer: image});
        const uploadResponse = await uploaded; const upload = await uploadResponse.json();
        check('native_file_widget_upload', uploadResponse.status() === 200 && upload.files[0].identity_version === before + 1);
        await page.waitForFunction(version => document.querySelector('input[name=matcher_identity_version]').value === String(version), before + 1);
        const crop = page.locator('.profile-image-crop[data-action-click-url*="expected_version="]');
        const del = page.locator('.profile-image-delete[data-action-click-url*="type=image"]');
        check('crop_token_updates_without_reload', (await crop.getAttribute('data-action-click-url')).endsWith('expected_version=' + (before + 1)));
        check('delete_token_updates_without_reload', (await del.getAttribute('data-action-click-url')).endsWith('expected_version=' + (before + 1)));
        check('upload_token_updates_without_reload', (await page.locator(input).getAttribute('data-upload-url')).endsWith('expected_version=' + (before + 1)));
        check('blueimp_cached_url_updated', await page.locator(input).evaluate((node, version) => jQuery(node).fileupload('option', 'url').endsWith('expected_version=' + version), before + 1));
        await page.locator('.profile-user-photo-container').hover();
        await crop.click();
        await page.locator('#profile-image-crop-modal').waitFor({state: 'visible'});
        check('native_crop_modal_opens', await page.locator('#crop-profile-image').isVisible());
        await page.waitForFunction(() => document.getElementById('crop-profile-image').naturalWidth > 0);
        await page.evaluate(() => { for (const [key, value] of Object.entries({cropX: 0, cropY: 0, cropW: 200, cropH: 200})) { document.getElementById(key).value = String(value); } });
        const cropped = page.waitForResponse(response => response.url().includes('/user/image/crop?') && response.request().method() === 'POST');
        await page.locator('#profile-image-crop-modal [data-action-click="ui.modal.submit"]').click();
        const cropResponse = await cropped;
        check('native_crop_confirmed', cropResponse.status() === 200);
        await page.waitForFunction(version => {
            const node = document.querySelector('.profile-image-delete[data-action-click-url*="type=image"]');
            return node && node.getAttribute('data-action-click-url').endsWith('expected_version=' + version);
        }, before + 2);
        check('crop_result_keeps_native_profile_working', !page.url().includes('/user/image/'));
        await page.locator('.profile-user-photo-container').hover();
        await page.locator('.profile-image-delete[data-action-click-url*="type=image"]').click();
        await page.locator('#globalModalConfirm').waitFor({state: 'visible'});
        const deleted = page.waitForResponse(response => response.url().includes('/user/image/delete?') && response.request().method() === 'POST');
        await page.locator('#globalModalConfirm [data-modal-confirm]').click();
        const deleteResponse = await deleted;
        check('native_delete_http_success', deleteResponse.status() === 200);
        const deletion = await deleteResponse.json();
        check('native_delete_confirmed', deletion.identity_version === before + 3 && typeof deletion.defaultUrl === 'string');
        await page.waitForFunction(version => {
            const node = document.querySelector('input[type=file][data-upload-url*="/user/image/upload"]');
            return node && node.getAttribute('data-upload-url').endsWith('expected_version=' + version);
        }, before + 3);
        const identity = await (await page.request.get(base + '/api/v1/me')).json();
        check('native_delete_matches_identity_api', identity.data.avatar_ref === null && identity.data.identity_version === before + 3);
        check('no_browser_runtime_errors', errors.length === 0);
        console.log(JSON.stringify({passed: checks.length, checks}));
    } finally { await browser.close(); }
})().catch(error => { console.error(JSON.stringify({completed_checks: checks, failure: error.message || error.name || 'Browser test failed'})); process.exit(1); });
