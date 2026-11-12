// Offline, synthetic source-shape and display mapping checks. No Yii bootstrap,
// database, HTTP, browser page, credential read, model call or dependency install.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(project, '../..');
const runtime = join(project, 'lib/recommendation-runtime');
const output = mkdtempSync(join(tmpdir(), 'matcher-recommendation-presentation-'));
const longBio = `  虚构测试资料\n${'测'.repeat(9000)}\n保留末尾换行与空格。  `;
const samples = {
  headline: '虚构测试：把活动流程做清楚', bio: longBio,
  direction: { code: 'community_tools', label: '活动工具', note: '本人关注的方向' },
  interest: { code: 'open_source', label: '开源工具' },
  role: { code: 'product', label: '产品协作' },
  skill: { code: 'php', label: 'PHP', self_level: 'working', note: '本人填写的技能' },
  seeking: '长期希望与愿意一起验证需求的人合作',
  project: { title: '虚构活动签到原型', role: '参与接口设计', contribution: '编写报名接口\n与同伴核对字段', outcome: '完成可运行的原型（虚构测试）',
    tech_codes: ['php', 'mysql'], links: ['https://example.invalid/synthetic-project'], start: { value: '2024', precision: 'year' }, end: { value: '2025-02', precision: 'month' } },
  mbti: 'INFP', personality: { traits: ['先写清任务'], self_description: '本人自述的做事方式' },
  collaboration_preference: { codes: ['small_steps'], free_text: '倾向分小步完成' },
  communication_preference: { codes: ['async'], free_text: '希望先文字说明' },
  event_goal: { codes: ['prototype'], free_text: '本次想完成可演示的原型' },
  event_role: { code: 'backend', label: '本次后端协作' },
  event_contribution: { skill_codes: ['php'], free_text: '本次愿意一起完成接口' },
  event_seeking: { role_codes: ['design'], skill_codes: ['figma'], free_text: '本次希望有人协助交互设计' },
  event_contact_preference: { codes: ['text'], free_text: '本次先通过文字讨论' },
  event_collaboration_mode: { mode: 'online', note: '本次先远程一起做' },
  event_availability: { starts_at: '2026-11-14T09:00:00+08:00', ends_at: '2026-11-14T12:00:00+08:00', timezone: 'Asia/Shanghai' },
};
const emptyObjects = ['event_goal', 'event_contribution', 'event_seeking', 'collaboration_preference', 'communication_preference', 'event_contact_preference'];
let passed = 0;
try {
  // Load only pure schema/policy definitions and validate synthetic values with the
  // source validator. Reading PHP constants is not a live backend integration test.
  const phpCode = String.raw`
$root = $argv[1];
require $root . '/backend/protected/modules/matcher-user-profile/domain/ValueValidator.php';
require $root . '/backend/protected/modules/matcher-user-profile/domain/FieldCatalog.php';
require $root . '/backend/protected/modules/matcher-profile-privacy/domain/DiscoveryFieldPolicy.php';
require $root . '/backend/protected/modules/matcher-profile-privacy/domain/VisibilityPolicy.php';
require $root . '/backend/protected/modules/matcher-profile-privacy/application/DiscoveryBatchService.php';
$input = json_decode(stream_get_contents(STDIN), true, 64, JSON_THROW_ON_ERROR);
$checks = [];
foreach ($input['samples'] as $key => $value) { $checks[$key] = \humhub\modules\matcherProfile\domain\FieldCatalog::validate($key, $value); }
$empty = [];
foreach ($input['empty_keys'] as $key) { $empty[$key] = \humhub\modules\matcherProfile\domain\FieldCatalog::validate($key, []); }
echo json_encode([
 'schema_version' => \humhub\modules\matcherProfile\domain\FieldCatalog::VERSION,
 'policy_version' => \humhub\modules\matcherPrivacy\application\DiscoveryBatchService::POLICY_VERSION,
 'keys' => \humhub\modules\matcherPrivacy\domain\DiscoveryFieldPolicy::KEYS,
 'definitions' => \humhub\modules\matcherProfile\domain\FieldCatalog::definitions(),
 'validation' => $checks, 'empty_validation' => $empty
], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
`;
  const reflected = spawnSync(join(root, 'backend/.runtime/php-mysql/bin/php'), ['-r', phpCode, root],
    { encoding: 'utf8', input: JSON.stringify({ samples, empty_keys: emptyObjects }), maxBuffer: 2 * 1024 * 1024 });
  assert.equal(reflected.status, 0, reflected.stderr || reflected.error?.message);
  const catalog = JSON.parse(reflected.stdout);
  const compiled = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), ...readdirSync(runtime).filter(file => file.endsWith('.ts')).map(file => join(runtime, file)),
    '--outDir', output, '--target', 'ES2020', '--module', 'commonjs', '--moduleResolution', 'node', '--lib', 'ES2020,DOM',
    '--strict', '--skipLibCheck', '--esModuleInterop', '--incremental', 'false', '--noEmit', 'false'], { cwd: project, encoding: 'utf8' });
  assert.equal(compiled.status, 0, `${compiled.stdout || ''}${compiled.stderr || ''}`);
  const api = require(join(output, 'person-presentation.js'));
  const context = { space_id: 17, selection_revision: `selection-${'a'.repeat(32)}`, access_version: 'synthetic-access-1' };
  const attribute = (key, value = samples[key], id = `synthetic-${key}`) => ({ attribute_id: id, key, value, visibility: 'authenticated', confirmation: 'confirmed', last_confirmed_at: '2026-11-12 00:00:00', schema_version: catalog.schema_version });
  const person = (keys = []) => ({
    owner_id: 11, space_id: 17, display_name: '虚构测试参与者', identity_version: 3, avatar_ref: null,
    global: { revision: 7, permission_version: 5, attributes: keys.filter(key => catalog.definitions[key].scope === 'global').map(key => attribute(key)) },
    space: { revision: 9, permission_version: 6, attributes: keys.filter(key => catalog.definitions[key].scope === 'event').map(key => attribute(key)) },
    updated_at: '2026-11-12T00:00:00.000000Z', relationship: { state: 'none', friend: false, pending_out: false, pending_in: false, version: 'synthetic-relationship' },
    discovery_version: 4, privacy_policy_version: catalog.policy_version,
  });
  const present = value => { const result = api.presentDiscoveryPerson(value, context); assert.equal(result.ok, true); return result; };
  const one = (key, value = samples[key]) => { const input = person([key]); input[catalog.definitions[key].scope === 'event' ? 'space' : 'global'].attributes[0].value = value; return present(input); };
  async function check(name, run) { await test(name, async () => { await run(); passed++; }); }

  await check('Support table matches the actual PHP catalog and combined P8 policy', () => {
    assert.equal(api.PERSON_PRESENTATION_SCHEMA_VERSION, catalog.schema_version);
    assert.equal(api.PERSON_PRESENTATION_POLICY_VERSION, catalog.policy_version);
    assert.equal(catalog.policy_version, 's3-2026-11-11:discovery-fields-v2');
    assert.deepEqual(api.PERSON_PRESENTATION_SUPPORT.map(item => item.key).sort(), [...catalog.keys].sort());
    for (const row of api.PERSON_PRESENTATION_SUPPORT) assert.equal(row.scope, catalog.definitions[row.key].scope === 'event' ? 'space' : 'global');
  });
  await check('All nineteen synthetic samples pass the real P1 value validator', () => {
    assert.equal(Object.keys(catalog.validation).length, 19);
    for (const [key, errors] of Object.entries(catalog.validation)) assert.deepEqual(errors, [], key);
    assert.deepEqual(Object.keys(samples).sort(), [...catalog.keys].sort());
  });
  await check('Empty profile has real identity and a neutral avatar, without six filler cards', () => {
    const { data } = present(person());
    assert.equal(data.status, 'empty'); assert.deepEqual(data.slices, []); assert.equal(data.unsupported, null);
    assert.equal(data.identity.display_name, '虚构测试参与者'); assert.equal(data.identity.avatar.kind, 'neutral_placeholder');
    for (const name of ['english', 'city', 'chapters', 'score', 'match_score', 'dimensions', 'active']) assert.equal(name in data, false);
  });
  await check('One attribute creates one fact slice and all nineteen create nineteen', () => {
    assert.equal(one('skill').data.slices.length, 1);
    const all = present(person(Object.keys(samples)));
    assert.equal(all.data.slices.length, 19); assert.equal(all.data.status, 'ready'); assert.deepEqual(all.diagnostics, []);
  });
  await check('Repeated legitimate projects stay independent and do not stop at six', () => {
    const input = person(); input.global.attributes = Array.from({ length: 12 }, (_, i) => attribute('project', { title: `虚构项目 ${i}` }, `synthetic-project-${i}`));
    const { data } = present(input); assert.equal(data.slices.length, 12); assert.equal(new Set(data.slices.map(slice => slice.id)).size, 12);
  });
  await check('Long biography preserves every character, whitespace and line break', () => {
    const { data } = one('bio');
    assert.equal(data.slices[0].facts[0].text, longBio); assert.equal(data.slices[0].facts[0].text.split('\n').length, 3);
    assert.equal(data.slices[0].facts[0].format, 'plain_text');
  });
  await check('Skill, current offer, current need and past project have different semantics', () => {
    const { data } = present(person(['skill', 'event_contribution', 'event_seeking', 'project']));
    const byKey = Object.fromEntries(data.slices.map(slice => [slice.reference.field_key, slice]));
    assert.equal(byKey.skill.kind, 'skill'); assert.equal(byKey.event_contribution.kind, 'activity_offer');
    assert.equal(byKey.event_seeking.kind, 'activity_need'); assert.equal(byKey.project.kind, 'project_experience');
    assert.ok(byKey.event_seeking.facts.some(row => row.label.includes('希望伙伴提供')));
    assert.ok(byKey.event_contribution.facts.some(row => row.label.includes('愿意提供')));
  });
  await check('A general skill cannot become a technology used in an unrelated project', () => {
    const input = person(['skill', 'project']); input.global.attributes.find(item => item.key === 'project').value = { title: '未填写技术的虚构项目' };
    const slice = present(input).data.slices.find(item => item.kind === 'project_experience');
    assert.deepEqual(slice.facts, []); assert.equal(JSON.stringify(slice).includes('PHP'), false);
  });
  await check('Interest and project intention do not become experience or capability conclusions', () => {
    assert.equal(one('interest').data.slices[0].kind, 'interest');
    assert.equal(one('event_goal').data.slices[0].kind, 'activity_goal');
    for (const key of ['interest', 'event_goal']) assert.equal('score' in one(key).data.slices[0], false);
  });
  await check('MBTI and personality remain self-reports without compatibility judgments', () => {
    for (const key of ['mbti', 'personality']) {
      const slice = one(key).data.slices[0]; assert.equal(slice.kind, 'self_reported_style'); assert.ok(slice.label.includes('本人自述'));
      assert.equal('judgment' in slice, false); assert.equal('recommendation' in slice, false);
    }
    assert.equal(one('mbti').data.slices[0].facts[0].text, 'INFP');
  });
  await check('References bind owner, activity, scope, real profile versions and schema without invented attribute_version', () => {
    const result = present(person(['skill', 'event_role']));
    const global = result.data.slices.find(slice => slice.reference.field_key === 'skill').reference;
    const event = result.data.slices.find(slice => slice.reference.field_key === 'event_role').reference;
    assert.deepEqual(global.scope, { kind: 'global' }); assert.deepEqual(event.scope, { kind: 'space', space_id: 17 });
    assert.equal(global.profile_revision, 7); assert.equal(global.permission_version, 5); assert.equal(event.profile_revision, 9); assert.equal(event.permission_version, 6);
    for (const ref of [global, event]) { assert.equal(ref.owner_id, 11); assert.deepEqual(ref.current_event, context); assert.equal(ref.schema_version, 2); assert.equal(ref.identity_version, 3); assert.equal(ref.discovery_version, 4); assert.equal(ref.privacy_policy_version, catalog.policy_version); assert.equal('attribute_version' in ref, false); }
  });
  await check('Reference version changes follow the supplied snapshot, without mutating its input', () => {
    const input = person(['skill']); const before = JSON.stringify(input); const first = present(input);
    assert.equal(JSON.stringify(input), before); input.global.revision += 1; input.global.permission_version += 1;
    const next = present(input); assert.notEqual(first.data.slices[0].reference.profile_revision, next.data.slices[0].reference.profile_revision);
    assert.equal(first.data.slices[0].id, next.data.slices[0].id);
  });
  await check('Year and month precision remain exact without invented days or ongoing status', () => {
    const facts = one('project').data.slices[0].facts;
    assert.ok(facts.some(row => row.text === '2024' && row.label.includes('年')));
    assert.ok(facts.some(row => row.text === '2025-02' && row.label.includes('月')));
    assert.equal(JSON.stringify(facts).includes('至今'), false);
  });
  await check('Availability preserves times and zone without overlap, duration or commitment inference', () => {
    const slice = one('event_availability').data.slices[0];
    assert.deepEqual(slice.facts.map(row => row.text), [samples.event_availability.starts_at, samples.event_availability.ends_at, 'Asia/Shanghai']);
    assert.equal(slice.kind, 'activity_availability'); assert.equal('overlap' in slice, false);
  });
  await check('Project links are validated text only and never an action or image', () => {
    const links = one('project').data.slices[0].links;
    assert.deepEqual(links, [{ text: samples.project.links[0], format: 'plain_text', interaction: 'none' }]);
    assert.equal('href' in links[0], false); assert.equal('src' in links[0], false);
  });
  for (const [name, link] of [['javascript', 'javascript:alert(1)'], ['data', 'data:text/html,test'], ['relative', '/private'], ['protocol-relative', '//example.invalid/x'], ['credentials', 'https://user:secret@example.invalid/x'], ['empty-userinfo', 'https://@example.invalid/x'], ['newline', 'https://example.invalid/\nx'], ['encoded-control', 'https://example.invalid/%0Ax'], ['backslash', 'https://example.invalid/\\x']]) await check(`Unsafe ${name} link never reaches visible content`, () => {
    const result = one('project', { title: '不应显示这个项目', links: [link] });
    assert.equal(result.data.slices.length, 0); assert.equal(result.diagnostics[0].reason, 'unsafe_link');
    assert.equal(JSON.stringify(result).includes(link), false); assert.equal(JSON.stringify(result.data).includes('不应显示'), false);
  });
  await check('HTML-like text stays literal plain text; the mapper produces no HTML sink or markup', () => {
    const raw = '<script>synthetic()</script>\n<img src=x onerror=synthetic()>';
    const slice = one('bio', raw).data.slices[0];
    assert.equal(slice.facts[0].text, raw); assert.equal(slice.facts[0].format, 'plain_text');
    assert.equal('html' in slice, false); assert.equal('dangerouslySetInnerHTML' in slice, false);
  });
  await check('Avatar reference never becomes an image URL, even if it resembles one', () => {
    const input = person(); input.avatar_ref = 'https://example.invalid/opaque-reference';
    const avatar = present(input).data.identity.avatar;
    assert.equal(avatar.kind, 'unresolved_reference'); assert.equal(avatar.reference, input.avatar_ref); assert.equal(avatar.fallback, 'neutral_placeholder');
    assert.equal('url' in avatar, false); assert.equal('src' in avatar, false);
  });
  for (const key of emptyObjects) await check(`Real PHP empty ${key} objects produce zero facts for [] and {}`, () => {
    assert.deepEqual(catalog.empty_validation[key], []);
    for (const value of [[], {}]) { const result = one(key, value); assert.equal(result.data.status, 'empty'); assert.deepEqual(result.data.slices, []); assert.deepEqual(result.diagnostics, []); }
    assert.equal(one(key, ['not-an-object']).diagnostics[0].reason, 'unsupported_shape');
  });
  await check('Unknown schema remains unsupported, while other reviewed attributes still display', () => {
    const input = person(['bio', 'skill']); input.global.attributes.find(item => item.key === 'skill').schema_version = 3;
    const result = present(input); assert.equal(result.data.status, 'partial'); assert.equal(result.data.slices.length, 1); assert.equal(result.diagnostics[0].reason, 'unsupported_schema');
    assert.equal(result.diagnostics[0].reference.schema_version, 3); assert.equal('value' in result.diagnostics[0], false);
  });
  await check('Unreviewed policy, including the wrong shortened policy, produces no fact slices', () => {
    for (const policy of ['discovery-fields-v2', 's3-2026-11-11:discovery-fields-v3']) {
      const input = person(['bio']); input.privacy_policy_version = policy;
      const result = present(input); assert.equal(result.data.status, 'unsupported'); assert.equal(result.data.slices.length, 0); assert.equal(result.diagnostics[0].reason, 'unsupported_policy');
      assert.equal(JSON.stringify(result).includes(longBio), false);
    }
  });
  await check('Unknown ordinary fields yield only internal references and generic UI state', () => {
    const input = person(); input.global.attributes.push(attribute('new_public_topic', { nested: 'do-not-traverse-or-render' }));
    const result = present(input); assert.equal(result.data.slices.length, 0); assert.equal(result.diagnostics[0].reason, 'unknown_field');
    assert.equal(result.diagnostics[0].reference.field_key, 'new_public_topic');
    assert.equal(JSON.stringify(result.data).includes('new_public_topic'), false); assert.equal(JSON.stringify(result).includes('do-not-traverse-or-render'), false);
  });
  await check('Renamed nested fields and unknown enum values are unsupported without raw fallback', () => {
    for (const [key, value] of [['skill', { code: 'php', title: 'RENAMED_FIELD_SENTINEL' }], ['skill', { code: 'php', label: 'PHP', self_level: 'MAGIC_LEVEL_SENTINEL' }], ['event_goal', { changed_text: 'NEW_SHAPE_SENTINEL' }]]) {
      const result = one(key, value); assert.equal(result.data.slices.length, 0); assert.equal(result.diagnostics[0].reason, 'unsupported_shape');
      assert.equal(JSON.stringify(result).includes('SENTINEL'), false);
    }
  });
  await check('Global/event scope swaps yield unsupported references without displaying the values', () => {
    const input = person(); input.global.attributes.push(attribute('event_goal', { free_text: 'wrong-scope-value' }));
    input.space.attributes.push(attribute('skill', { code: 'php', label: 'wrong-scope-value' }));
    const result = present(input); assert.equal(result.data.slices.length, 0); assert.ok(result.diagnostics.every(row => row.reason === 'scope_mismatch'));
    assert.equal(JSON.stringify(result).includes('wrong-scope-value'), false);
  });
  for (const key of ['contact_email', 'contact_phone', 'raw_source', 'source_text', 'draft_text', 'unconfirmed_profile', 'private_note']) await check(`Purpose-incompatible ${key} is rejected without a field-name or value disclosure`, () => {
    const input = person(); input.global.attributes.push(attribute(key, 'sensitive-synthetic-sentinel'));
    assert.deepEqual(api.presentDiscoveryPerson(input, context), { ok: false, error: 'invalid_projection' });
  });
  await check('Friends/private/unconfirmed inputs are rejected without a hidden-field diagnostic', () => {
    for (const change of [a => { a.visibility = 'friends'; }, a => { a.visibility = 'private'; }, a => { a.confirmation = 'pending'; }]) {
      const input = person(['bio']); change(input.global.attributes[0]);
      assert.deepEqual(api.presentDiscoveryPerson(input, context), { ok: false, error: 'invalid_projection' });
    }
  });
  await check('Activity mismatch and missing confirmed name do not create a replacement identity', () => {
    assert.deepEqual(api.presentDiscoveryPerson(person(), { ...context, space_id: 18 }), { ok: false, error: 'context_mismatch' });
    assert.deepEqual(api.presentDiscoveryPerson({ ...person(), display_name: '' }, context), { ok: false, error: 'invalid_projection' });
  });
  await check('Profile update time never becomes an activity or matching claim', () => {
    const { data } = present(person(['bio']));
    assert.deepEqual(data.profile_updated_at, { value: '2026-11-12T00:00:00.000000Z', meaning: 'profile_update_time' });
    assert.equal('last_active' in data, false); assert.equal('compatibility' in data, false);
  });
  console.log(JSON.stringify({ scope: 'offline discovery fact presentation', passed, sourceCatalog: { schema_version: catalog.schema_version, policy_version: catalog.policy_version, field_count: catalog.keys.length },
    realHttpRequests: 0, modelCalls: 0, databaseConnections: 0, uiMounted: false }));
} finally { rmSync(output, { recursive: true, force: true }); }
