#!/usr/bin/env node
'use strict';

// Read-only navigation acceptance against the root's isolated synthetic fixture.
// Usage: node s3_entry_links_browser.cjs http://127.0.0.1:8095 humhub_profile_s3_test_...
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.MATCHER_PLAYWRIGHT_PATH || 'playwright');

const [base, database] = process.argv.slice(2);
assert.match(base || '', /^http:\/\/127\.0\.0\.1:\d+$/);
assert.match(database || '', /^humhub_profile_s3_test_[a-z0-9_]+$/);
assert.notEqual(new URL(base).port, '8090', 'Do not navigate the main preview server');
const backend = path.resolve(__dirname, '../../../../..');
const fixture = JSON.parse(fs.readFileSync(path.join(backend, '.runtime/profile-s3', database, 'root-fixture.json'), 'utf8'));
const checks = [];
const failures = [];
const blocked = [];
const check = (name, condition) => { assert.ok(condition, name); checks.push(name); };

function entryMatches(url, type, id) {
  const parsed = new URL(url, base);
  return parsed.origin === base && parsed.searchParams.get('entry_type') === type &&
    (type === 'space' ? parsed.searchParams.get('space_id') === String(id) && !parsed.searchParams.has('post_id') :
      type === 'public_post' ? parsed.searchParams.get('post_id') === String(id) && !parsed.searchParams.has('space_id') :
        !parsed.searchParams.has('space_id') && !parsed.searchParams.has('post_id'));
}

async function waitAbout(page) {
  await page.waitForFunction(() => document.body.innerText.includes('Public collaboration headline') && document.body.innerText.includes('联系方式'));
}

async function assertOrdinaryProjection(page, label) {
  await waitAbout(page);
  const body = await page.locator('body').innerText();
  check(label + '_allowed_fields_and_contact', body.includes('Public root project') && body.includes('synthetic_wechat_root'));
  check(label + '_private_and_friend_fields_absent', !body.includes('Private Root Name') && !body.includes('Friends-only biography marker') && !body.includes('Private planning style') && !body.includes('synthetic-contact@example.invalid'));
}

async function roundTripTabs(page, type, id, label) {
  const stream = page.getByRole('link', { name: 'Stream', exact: true });
  check(label + '_stream_link_keeps_entry', entryMatches(await stream.getAttribute('href'), type, id));
  await stream.click();
  await page.waitForURL(url => url.pathname.endsWith('/home') && entryMatches(url.href, type, id));
  const about = page.getByRole('link', { name: 'About', exact: true });
  await about.waitFor();
  check(label + '_about_menu_is_visible_and_keeps_entry', entryMatches(await about.getAttribute('href'), type, id));
  await about.click();
  await page.waitForURL(url => url.pathname.endsWith('/about') && entryMatches(url.href, type, id));
  await waitAbout(page);
  check(label + '_tabs_return_to_readable_about', (await page.locator('body').innerText()).includes('Public root project'));
  const images = page.locator('a[data-profile-entry] img').locator('..');
  check(label + '_profile_avatar_keeps_entry', await images.count() > 0 && entryMatches(await images.first().getAttribute('href'), type, id));
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.MATCHER_BROWSER_PATH ? { executablePath: process.env.MATCHER_BROWSER_PATH } : {}) });
  const contexts = [];
  async function session(userId) {
    const context = await browser.newContext(); contexts.push(context);
    // Never follow a clone's misconfigured absolute URL into the main preview.
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== base) { blocked.push(url.origin); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => failures.push(error.message));
    page.on('response', response => { if (response.status() >= 500) failures.push(response.status() + ' ' + new URL(response.url()).pathname); });
    const login = await page.goto(base + '/__s3_test/login?id=' + userId);
    assert.equal(login.status(), 200); assert.equal((await login.json()).user_id, userId);
    return page;
  }
  try {
    const spaceId = fixture.spaces[0];
    const member = await session(fixture.users.viewer);
    await member.goto(base + '/user/people?space_id=' + spaceId);
    const card = member.getByRole('link', { name: 'Synthetic teammate', exact: true });
    await card.waitFor();
    const ownerUrl = new URL(await card.getAttribute('href'), base);
    check('people_card_binds_verified_space', entryMatches(ownerUrl.href, 'space', spaceId));
    await card.click();
    await member.waitForURL(url => url.pathname.endsWith('/about') && entryMatches(url.href, 'space', spaceId));
    await assertOrdinaryProjection(member, 'space_card_click');
    await roundTripTabs(member, 'space', spaceId, 'space');

    const reader = await session(fixture.users.public_reader);
    await reader.goto(base + ownerUrl.pathname);
    check('bare_nonfriend_profile_has_no_projected_details', !(await reader.locator('body').innerText()).includes('Public collaboration headline'));
    check('bare_nonfriend_has_no_about_menu', await reader.getByRole('link', { name: 'About', exact: true }).count() === 0);
    await reader.goto(base + '/content/perma?id=' + fixture.content_id);
    check('permalink_remains_in_isolated_server', new URL(reader.url()).origin === base);
    const postUrl = reader.url();
    const header = reader.locator('.wall-entry-header');
    const author = header.locator('.wall-entry-header-info a[data-profile-entry="public_post"]').first();
    const avatar = header.locator('.wall-entry-header-image a[data-profile-entry="public_post"]').first();
    await author.waitFor();
    check('post_author_binds_post_model_id', entryMatches(await author.getAttribute('href'), 'public_post', fixture.post_id));
    check('post_avatar_binds_same_author_entry', entryMatches(await avatar.getAttribute('href'), 'public_post', fixture.post_id));
    check('post_id_is_not_content_id', fixture.post_id !== fixture.content_id);
    check('post_content_unchanged', (await reader.locator('.wall-entry-content').innerText()).trim() === 'Synthetic public author entry');
    check('post_body_has_no_injected_profile_links', await reader.locator('.wall-entry-body [data-profile-entry]').count() === 0);
    check('post_permalink_is_not_replaced_by_profile_link', await header.locator('h5 a:not([data-profile-entry])').count() > 0);
    await author.click();
    await reader.waitForURL(url => url.pathname.endsWith('/about') && entryMatches(url.href, 'public_post', fixture.post_id));
    await assertOrdinaryProjection(reader, 'public_author_click');
    await roundTripTabs(reader, 'public_post', fixture.post_id, 'public_post');
    await reader.goto(postUrl);
    await reader.locator('.wall-entry-header-image a[data-profile-entry="public_post"]').first().click();
    await reader.waitForURL(url => url.pathname.endsWith('/about') && entryMatches(url.href, 'public_post', fixture.post_id));
    await assertOrdinaryProjection(reader, 'public_avatar_click');
    await reader.goto(base + '/user/people');
    check('public_author_entry_does_not_expand_people_discovery', await reader.getByRole('link', { name: 'Synthetic teammate', exact: true }).count() === 0);

    const friend = await session(fixture.users.friend);
    await friend.goto(base + ownerUrl.pathname);
    await waitAbout(friend);
    check('bare_mutual_friend_entry_still_works', (await friend.locator('body').innerText()).includes('Friends-only biography marker'));
    check('friend_contact_policy_remains_dynamic', (await friend.locator('body').innerText()).includes('synthetic-contact@example.invalid'));
    await roundTripTabs(friend, 'friendship', undefined, 'friendship');
    check('no_external_or_main_preview_requests', blocked.length === 0);
    check('no_browser_errors_or_server_500s', failures.length === 0);
    process.stdout.write(JSON.stringify({ status: 'passed', passed: checks.length, checks }) + '\n');
  } finally {
    await Promise.all(contexts.map(context => context.close()));
    await browser.close();
  }
})().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
