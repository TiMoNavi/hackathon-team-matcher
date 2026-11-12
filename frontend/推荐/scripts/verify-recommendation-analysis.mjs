// Persistent offline contract checks. Does not bootstrap HumHub or call an API.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
const require = createRequire(import.meta.url); const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtime = join(project, 'lib/recommendation-runtime'); const output = mkdtempSync(join(tmpdir(), 'matcher-analysis-contract-'));
let passed = 0;
try {
  const compile = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), ...readdirSync(runtime).filter(name => name.endsWith('.ts')).map(name => join(runtime, name)), '--outDir', output, '--target', 'ES2020', '--module', 'commonjs', '--moduleResolution', 'node', '--lib', 'ES2020,DOM', '--strict', '--skipLibCheck', '--incremental', 'false', '--noEmit', 'false'], { encoding: 'utf8' }); assert.equal(compile.status, 0, compile.stdout + compile.stderr);
  const api = require(join(output, 'analysis.js')); const { createSameOriginDiscoveryTransport } = require(join(output, 'browser-transport.js')); const { RecommendationController } = require(join(output, 'controller.js'));
  const context = { space_id: 17, selection_revision: 'selection-' + 'a'.repeat(32), access_version: 'access-1' };
  const bootstrap = { api_base: '/prefix/api/v1', base_path: '/prefix/matcher/app', csrf_header: 'X-CSRF-Token', csrf_token: 'synthetic-offline-csrf' };
  const option = { attribute_id: 'self-need', source_key: 'event_seeking', scope: 'space:17', facts: [{ semantic: 'needed_roles', values: ['backend'] }] };
  const selection = { space_id: 17, selection_version: 8, selection_current: false, selected_attribute_ids: [], options: [option] };
  const person = { owner_id: 11, space_id: 17, global: { revision: 3, permission_version: 4 }, space: { revision: 5, permission_version: 6 }, identity_version: 1, discovery_version: 2, privacy_policy_version: 's3-2026-11-11:discovery-fields-v2' };
  const envelope = data => new Response(JSON.stringify({ data, meta: { request_id: 'a'.repeat(24) } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const err = (status, code) => new Response(JSON.stringify({ error: { code, message: 'synthetic', retryable: false, details: [] }, meta: { request_id: 'b'.repeat(24) } }), { status, headers: { 'Content-Type': 'application/json' } });
  async function check(name, run) { await test(name, async () => { await run(); passed++; }); }
  await check('Same-origin transport prefixes only reviewed routes and retains credential semantics', async () => {
    let called; const transport = createSameOriginDiscoveryTransport(bootstrap, 'https://example.invalid', async (url, init) => { called = { url, init }; return envelope(context); });
    await transport({ method: 'GET', url: '/api/v1/me/current-event', credentials: 'same-origin', cache: 'no-store', redirect: 'error' });
    assert.equal(called.url, '/prefix/api/v1/me/current-event'); assert.equal(called.init.credentials, 'same-origin'); assert.equal(called.init.redirect, 'error');
  });
  for (const target of ['https://evil.invalid/api/v1/me/current-event', '//evil.invalid/api/v1/me/current-event', '/api/v1/me', '/api/v1/events/17/recommendation-analysis/self-selection']) await check('GET transport rejects unreviewed target ' + target, async () => {
    let count = 0; const transport = createSameOriginDiscoveryTransport(bootstrap, 'https://example.invalid', async () => { count++; return envelope({}); });
    await assert.rejects(() => transport({ method: 'GET', url: target, credentials: 'same-origin', cache: 'no-store', redirect: 'error' })); assert.equal(count, 0);
  });
  await check('Cross-activity selection retains monotonic version and no stale IDs', () => { const result = api.decodeSelfSelection(selection, 17); assert.equal(result.selection_version, 8); assert.equal(result.selection_current, false); assert.deepEqual(result.selected_attribute_ids, []); });
  await check('Uncurrent selection cannot claim selected IDs', () => assert.throws(() => api.decodeSelfSelection({ ...selection, selected_attribute_ids: ['self-need'] }, 17)));
  await check('Valid microsecond time windows preserve source precision', () => {
    const input = { ...selection, options: [{ attribute_id: 'time', source_key: 'event_availability', scope: 'space:17', facts: [{ semantic: 'availability', values: [{ starts_at: '2026-11-12T00:00:00.000001Z', ends_at: '2026-11-12T00:00:00.000002Z', timezone: 'UTC' }] }] }] };
    assert.equal(api.decodeSelfSelection(input, 17).options[0].facts[0].values[0].ends_at, '2026-11-12T00:00:00.000002Z');
  });
  for (const changed of [{ source_key: 'private_note' }, { source_key: 'bio' }, { scope: 'space:18' }, { facts: [{ semantic: 'needed_skills', values: { text: 'raw source' } }] }, { facts: [{ semantic: 'personality', values: ['leader'] }] }]) await check('Selection options reject incompatible purpose ' + JSON.stringify(changed), () => assert.throws(() => api.decodeSelfSelection({ ...selection, options: [{ ...option, ...changed }] }, 17)));
  await check('Empty save includes exact context/CAS request and validates receipt', async () => {
    const calls = []; const client = api.createAnalysisApi(bootstrap, 'https://example.invalid', async (url, init) => { calls.push({ url, init }); return envelope(url.endsWith('current-event') ? context : { ...selection, selection_version: 9, selection_current: true }); }, context, 10);
    const result = await client.saveSelection([], 8); assert.equal(result.ok, true); const put = calls.find(call => call.init.method === 'PUT');
    assert.deepEqual(JSON.parse(put.init.body), { attribute_ids: [], expected_selection_version: 8, expected_current_event: { selection_revision: context.selection_revision, access_version: context.access_version } });
    assert.equal(put.init.headers['X-CSRF-Token'], bootstrap.csrf_token); assert.equal(put.init.credentials, 'same-origin'); assert.equal(calls.length, 3);
  });
  for (const change of [{ selection_version: 8 }, { selected_attribute_ids: ['self-need'] }, { selection_current: false }]) await check('Save cannot report success from wrong receipt ' + JSON.stringify(change), async () => {
    const client = api.createAnalysisApi(bootstrap, 'https://example.invalid', async url => envelope(url.endsWith('current-event') ? context : { ...selection, selection_version: 9, selection_current: true, ...change }), context, 10);
    const result = await client.saveSelection([], 8); assert.equal(result.ok, false); assert.equal(result.error.kind, 'invalid-response');
  });
  for (const status of [401, 403]) await check('Malformed authorization response retains invalidation ' + status, async () => {
    const client = api.createAnalysisApi(bootstrap, 'https://example.invalid', async url => url.endsWith('current-event') ? envelope(context) : new Response('{', { status, headers: { 'Content-Type': 'application/json' } }), context, 10);
    const result = await client.readSelection(); assert.equal(result.ok, false); assert.equal(result.error.status, status); assert.equal(result.error.invalidation, status === 401 ? 'session' : 'activity');
  });
  await check('Activity A-B-A epoch change prevents any mutation', async () => {
    let writes = 0; const client = api.createAnalysisApi(bootstrap, 'https://example.invalid', async (url, init) => { if (init.method !== 'GET') writes++; return envelope({ ...context, selection_revision: 'selection-' + 'b'.repeat(32) }); }, context, 10);
    const result = await client.saveSelection([], 8); assert.equal(result.ok, false); assert.equal(result.error.code, 'ANALYSIS_CONTEXT_CHANGED'); assert.equal(writes, 0);
  });
  await check('Analysis posts only version references including activity epoch', async () => {
    let post; const client = api.createAnalysisApi(bootstrap, 'https://example.invalid', async (url, init) => { if (url.endsWith('current-event')) return envelope(context); post = JSON.parse(init.body); return err(503, 'ANALYSIS_UNAVAILABLE'); }, context, 10);
    const result = await client.analyze(person, 8); assert.equal(result.ok, false); assert.equal(result.error.status, 503); assert.deepEqual(Object.keys(post).sort(), ['expected_candidate', 'expected_current_event', 'expected_selection_version']); assert.deepEqual(post.expected_current_event, { selection_revision: context.selection_revision, access_version: context.access_version }); assert.equal('values' in post, false);
  });
  await check('Uncertain mutation failure never retries itself', async () => { let writes = 0; const client = api.createAnalysisApi(bootstrap, 'https://example.invalid', async (url, init) => { if (init.method === 'GET') return envelope(context); writes++; throw new Error('offline'); }, context, 10); const result = await client.saveSelection([], 8); assert.equal(result.ok, false); assert.equal(result.error.kind, 'network'); assert.equal(writes, 1); });
  await check('Oversized selection fails before any request', async () => { let calls = 0; const client = api.createAnalysisApi(bootstrap, 'https://example.invalid', async () => { calls++; return envelope({}); }, context, 10); const result = await client.saveSelection(Array.from({ length: 500 }, (_, i) => i + '-' + 'x'.repeat(100)), 8); assert.equal(result.ok, false); assert.equal(calls, 0); });
  await check('Disposed controller ignores late external denial', () => { const controller = new RecommendationController({ readCurrentEvent: async () => ({ ok: true, data: context, requestId: 'x' }) }, context); controller.dispose(); const before = controller.snapshot(); controller.invalidate({ kind: 'http', status: 403, code: 'DENIED', message: '', retryable: false, requestId: null, invalidation: 'activity' }); assert.equal(controller.snapshot(), before); });
  for (const status of [401, 403]) await check('Query refresh cannot suppress late authoritative denial ' + status, async () => {
    let notices = 0; const controller = new RecommendationController({ readCurrentEvent: async () => ({ ok: true, data: context, requestId: 'x' }), readPage: async (_context, query) => ({ ok: true, data: { space_id: 17, target_type: 'person', sort: query.sort, limit: 24, items: [], next_cursor: null, has_more: false, exhausted: true }, requestId: 'x' }) }, context, () => notices++);
    await controller.refresh(); const firstEpoch = controller.snapshot().epoch;
    await controller.refresh({ filters: { skill: ['typescript'] } }); assert.ok(controller.snapshot().epoch > firstEpoch); assert.equal(controller.snapshot().contextStatus, 'ready');
    controller.invalidate({ kind: 'http', status, code: 'DENIED', message: '', retryable: false, requestId: null, invalidation: status === 401 ? 'session' : 'activity' });
    assert.equal(controller.snapshot().context, null); assert.deepEqual(controller.snapshot().list.items, []); assert.equal(notices, 1);
  });
  console.log(JSON.stringify({ checks: passed, realHttpRequests: 0, modelCalls: 0, databaseConnections: 0 }));
} finally { rmSync(output, { recursive: true, force: true }); }
