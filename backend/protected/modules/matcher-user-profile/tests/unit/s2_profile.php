<?php
declare(strict_types=1);

$moduleRoot = dirname(__DIR__, 2);
spl_autoload_register(static function (string $class) use ($moduleRoot): void {
    $prefix = implode(chr(92), ['humhub', 'modules', 'matcherProfile']) . chr(92);
    if (str_starts_with($class, $prefix)) {
        $file = $moduleRoot . '/' . str_replace(chr(92), '/', substr($class, strlen($prefix))) . '.php';
        if (is_file($file)) { require $file; }
    }
});

use humhub\modules\matcherProfile\application\ProfileService;
use humhub\modules\matcherProfile\adapters\memory\InMemoryProfileRepository;
use humhub\modules\matcherProfile\adapters\memory\InMemoryProfileAccessPolicy;
use humhub\modules\matcherProfile\adapters\memory\InMemoryProfileResourcePolicy;
use humhub\modules\matcherProfile\domain\FieldCatalog;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\ProfileScope;

$checks = 0;
function check(bool $condition, string $label): void { global $checks; ++$checks; if (!$condition) { throw new RuntimeException('FAILED: ' . $label); } }
function rejects(callable $action, int $status, string $label): void {
    try { $action(); } catch (ProfileException $e) { check($e->httpStatus === $status, $label . ' status=' . $e->httpStatus); return; }
    check(false, $label . ' did not reject');
}
function item(array $profile, string $key): array { foreach ($profile['attributes'] as $attribute) { if ($attribute['key'] === $key) { return $attribute; } } throw new RuntimeException('Missing item: ' . $key); }
function snapshot(InMemoryProfileRepository $repo): string { return serialize([$repo->states, $repo->attributes, $repo->drafts, $repo->revisions, $repo->native]); }

$repo = new InMemoryProfileRepository();
$access = new InMemoryProfileAccessPolicy();
$access->users = [1, 2, 3, 9];
$access->administrators = [9];
$access->memberships = [10 => [1, 2], 20 => [1, 3]];
$resources = new InMemoryProfileResourcePolicy();
$resources->resources = [
    'qr:synthetic:owner-one' => ['owner_id' => 1, 'kind' => 'contact_qr', 'ready' => true],
    'qr:synthetic:other' => ['owner_id' => 2, 'kind' => 'contact_qr', 'ready' => true],
    'qr:synthetic:pending' => ['owner_id' => 1, 'kind' => 'contact_qr', 'ready' => false],
];
$clock = '2026-11-11 10:00:00';
$service = new ProfileService($repo, $access, $resources, static function () use (&$clock): string { return $clock; });
$global = ProfileScope::global();
$space10 = ProfileScope::event(10);
$space20 = ProfileScope::event(20);
$repo->native[1] = ['headline' => 'Synthetic legacy headline', 'city' => 'Synthetic city', 'contact_phone' => '+1 202 555 0100', 'email' => 'hidden-login@example.test'];

check(FieldCatalog::VERSION === 2, 'catalog version 2');
check(count(FieldCatalog::definitions()) === 37, '37 ordinary field types');
foreach (['contact_wechat', 'contact_wechat_qr', 'contact_qq', 'contact_phone', 'contact_email', 'contact_other'] as $key) {
    $definition = FieldCatalog::get($key);
    check($definition['scope'] === 'global', $key . ' global');
    check($definition['required_when'] === [], $key . ' optional');
    check($definition['default_visibility'] === 'authenticated', $key . ' default authenticated');
}
check(FieldCatalog::nativeBindings()['contact_phone']['columns'] === ['mobile'], 'phone reuses native mobile');
check(FieldCatalog::validate('contact_phone', '+86 138 0000 0000') === [], 'international phone valid');
check(FieldCatalog::validate('contact_phone', 'not a phone') !== [], 'bad phone invalid');
check(FieldCatalog::validate('contact_qq', '12345678') === [], 'QQ digit account');
check(FieldCatalog::validate('contact_qq', 'abc123456') !== [], 'bad QQ invalid');
check(FieldCatalog::validate('contact_email', 'synthetic@example.test') === [], 'contact email valid');
check(FieldCatalog::validate('contact_email', 'invalid') !== [], 'bad contact email invalid');
check(FieldCatalog::validate('contact_other', ['label' => 'Matrix', 'value' => '@synthetic:example.test']) === [], 'other contact valid');
check(FieldCatalog::validate('contact_wechat_qr', ['file_ref' => 'qr:synthetic:owner-one']) === [], 'QR schema accepts resource ref');
check(FieldCatalog::validate('contact_wechat_qr', ['url' => 'https://example.test/qr.png']) !== [], 'QR arbitrary URL is not resource ref');

$initial = $service->getProfile(1, 1, $global);
check(in_array('state:1:global', $repo->lockLog, true), 'profile read uses a state lock inside a consistent transaction');
check($initial['attributes'] === [] && $initial['revision'] === 0, 'legacy native values not confirmed automatically');
check(count($initial['legacy_candidates']) === 3, 'owner receives ordinary legacy candidates');
check(!in_array('email', array_column($initial['legacy_candidates'], 'key'), true), 'login email never imported as contact');
$other = $service->getProfile(2, 1, $global, 10);
check(!isset($other['legacy_candidates'], $other['editing_draft']) && $other['attributes'] === [], 'other user cannot read legacy or drafts');
rejects(fn() => $service->getProfile(2, 1, $global), 403, 'other user needs current Space');
rejects(fn() => $service->getProfile(2, 1, $global, 20), 403, 'other user must belong to current Space');
rejects(fn() => $service->getProfile(0, 1, $global, 10), 401, 'anonymous access denied');
rejects(fn() => $service->startDraft(2, 1, $global), 403, 'cannot edit another profile');
rejects(fn() => $service->startDraft(1, 1, ProfileScope::event(99)), 403, 'formal membership required');

$draft = $service->startDraft(1, 1, $global);
check($draft['draft_version'] === 1 && $draft['fields'] === [], 'empty draft starts at version one');
check($service->startDraft(1, 1, $global)['id'] === $draft['id'], 'start resumes same editing draft');
$draft = $service->updateDraft(1, 1, $global, $draft['id'], 1, [
    ['key' => 'headline', 'value' => 'Synthetic profile headline'],
    ['key' => 'contact_phone', 'value' => '+86 138 0000 0000'],
    ['key' => 'contact_email', 'value' => 'synthetic@example.test'],
    ['key' => 'contact_wechat', 'value' => 'synthetic-wechat'],
    ['key' => 'contact_qq', 'value' => '12345678'],
    ['key' => 'contact_other', 'value' => ['label' => 'Matrix', 'value' => '@synthetic:example.test']],
    ['key' => 'project', 'value' => ['title' => 'Synthetic first project'], 'sort_order' => 10],
    ['key' => 'project', 'value' => ['title' => 'Synthetic second project'], 'sort_order' => 11],
    ['key' => 'communication_preference', 'value' => ['codes' => ['async']], 'visibility' => 'friends'],
    ['key' => 'personality', 'value' => ['traits' => ['喜欢先沟通']], 'visibility' => 'private'],
]);
check($draft['draft_version'] === 2 && count($draft['fields']) === 10, 'draft update records operations');
check(count(array_unique(array_column($draft['fields'], 'attribute_id'))) === 10, 'new records receive unique server IDs');
check($repo->native[1]['headline'] === 'Synthetic legacy headline', 'draft does not mutate native value');
check($service->getProfile(1, 1, $global)['attributes'] === [], 'draft not current profile');
$headlineId = $draft['fields'][0]['attribute_id'];
$phoneId = $draft['fields'][1]['attribute_id'];
rejects(fn() => $service->updateDraft(1, 1, $global, $draft['id'], 1, []), 409, 'stale draft version rejected');
rejects(fn() => $service->updateDraft(1, 1, $global, $draft['id'], 2, [['key' => 'event_constraint', 'value' => 'wrong scope']]), 422, 'Space field rejected in global');
rejects(fn() => $service->updateDraft(1, 1, $global, $draft['id'], 2, [['attribute_id' => '00000000-0000-4000-8000-000000000000', 'key' => 'bio', 'value' => 'unknown']]), 422, 'invented stable ID rejected');
rejects(fn() => $service->updateDraft(1, 1, $global, $draft['id'], 2, [['attribute_id' => $headlineId, 'key' => 'bio', 'value' => 'changed type']]), 422, 'stable ID cannot change key');
rejects(fn() => $service->updateDraft(1, 1, $global, $draft['id'], 2, [['attribute_id' => $headlineId, 'value' => null]]), 422, 'null never silently deletes');
rejects(fn() => $service->updateDraft(1, 1, $global, $draft['id'], 2, [['op' => 'delete']]), 422, 'delete requires ID');
rejects(fn() => $service->updateDraft(1, 1, $global, $draft['id'], 2, [['key' => 'nickname', 'value' => 'Identity injection']]), 422, 'identity separate from ordinary profile');
rejects(fn() => $service->updateDraft(1, 1, $global, $draft['id'], 2, [['key' => 'bio', 'value' => 'x', 'confirmation' => 'confirmed']]), 422, 'client cannot inject confirmation');
rejects(fn() => $service->updateDraft(1, 1, $global, $draft['id'], 2, [['key' => 'bio', 'value' => 'x', 'record_group_id' => str_repeat('x', 37)]]), 422, 'record group ID is bounded before persistence');
rejects(fn() => $service->updateDraft(1, 1, $global, $draft['id'], 2, [['key' => 'bio', 'value' => 'x', 'record_group_id' => 'not-a-uuid']]), 422, 'record group ID uses UUID contract');
rejects(fn() => $service->confirmDraft(1, 1, $global, $draft['id'], 2, 1), 409, 'base revision is mandatory concurrency check');
$partial = $service->confirmDraft(1, 1, $global, $draft['id'], 2, 0, [$headlineId]);
check($partial['confirmed_revision'] === 1 && $partial['draft_status'] === 'editing' && $partial['draft_version'] === 3, 'partial confirmation advances profile and draft');
check(count($partial['profile']['attributes']) === 1, 'only selected item published');
check($partial === $service->confirmDraft(1, 1, $global, $draft['id'], 2, 0, [$headlineId]), 'exact partial retry returns identical receipt');
rejects(fn() => $service->confirmDraft(1, 1, $global, $draft['id'], 2, 0, [$phoneId]), 409, 'different partial request cannot reuse version');
$remaining = $service->getDraft(1, 1, $global, $draft['id']);
check(in_array('draft:' . $draft['id'], $repo->lockLog, true), 'draft preview read locks its draft and state');
check(count($remaining['fields']) === 9 && $remaining['base_revision'] === 1, 'unconfirmed operations retained with fresh base');
$confirmed = $service->confirmDraft(1, 1, $global, $draft['id'], 3, 1);
check($confirmed['confirmed_revision'] === 2 && $confirmed['draft_status'] === 'confirmed', 'remaining fields confirm atomically');
check($confirmed === $service->confirmDraft(1, 1, $global, $draft['id'], 3, 1), 'exact full confirmation retry returns same receipt');
check(count($repo->revisions[array_key_first($repo->states)]) === 2, 'duplicate confirmation creates no extra revision');
check($repo->native[1]['headline'] === 'Synthetic profile headline' && $repo->native[1]['contact_phone'] === '+86 138 0000 0000', 'confirmed native values written');
check($repo->native[1]['city'] === 'Synthetic city', 'untouched native legacy value preserved');
check(count(array_filter($confirmed['profile']['attributes'], fn($item) => $item['key'] === 'project')) === 2, 'repeatable projects remain independent records');
check(item($confirmed['profile'], 'contact_phone')['visibility'] === 'authenticated', 'new contact confirmed visible');
check(item($confirmed['profile'], 'communication_preference')['visibility'] === 'friends', 'explicit visibility preserved');
$public = $service->getProfile(2, 1, $global, 10);
check(count($public['attributes']) === 8, 'S2 public projection only authenticated confirmed fields');
check(!in_array('personality', array_column($public['attributes'], 'key'), true), 'private item not leaked');
check($service->getRevision(1, 1, $global, 1)['attributes'][0]['value'] === 'Synthetic profile headline', 'immutable historical snapshot read');
rejects(fn() => $service->getRevision(2, 1, $global, 1), 403, 'history owner only');
rejects(fn() => $service->getDraft(2, 1, $global, $draft['id']), 403, 'draft owner only');
rejects(fn() => $service->getRevision(1, 1, $global, 99), 404, 'missing revision distinct error');

$first = $service->startDraft(1, 1, $global, 'manual');
$second = $service->startDraft(1, 1, $global, 'onboarding');
$first = $service->updateDraft(1, 1, $global, $first['id'], 1, [['attribute_id' => $headlineId, 'value' => 'Updated synthetic headline']]);
$second = $service->updateDraft(1, 1, $global, $second['id'], 1, [['key' => 'bio', 'value' => 'Concurrent synthetic draft']]);
$changed = $service->confirmDraft(1, 1, $global, $first['id'], 2, 2);
check($changed['profile']['permission_version'] === $confirmed['profile']['permission_version'], 'value-only change keeps permission version');
check(item($changed['profile'], 'headline')['attribute_id'] === $headlineId, 'edit preserves stable ID');
check(item($changed['profile'], 'contact_phone')['value'] === '+86 138 0000 0000', 'omitted field preserved');
rejects(fn() => $service->confirmDraft(1, 1, $global, $second['id'], 2, 2), 409, 'parallel stale base cannot overwrite');
check($service->getRevision(1, 1, $global, 2)['attributes'] === $confirmed['profile']['attributes'], 'earlier history immutable after native change');
$completedDraft = $service->getDraft(1, 1, $global, $draft['id']);
check($completedDraft['preview_attributes'] === $confirmed['profile']['attributes'], 'completed draft preview uses its immutable confirmed snapshot');

$clock = '2026-11-11 12:00:00';
$reconfirmed = $service->reconfirm(1, 1, $global, 3, [$phoneId]);
check($reconfirmed['revision'] === 4, 'reconfirmation creates revision');
check(item($reconfirmed, 'contact_phone')['last_confirmed_at'] === $clock, 'selected confirmation timestamp updated');
check(item($reconfirmed, 'headline')['last_confirmed_at'] === '2026-11-11 10:00:00', 'unselected confirmation timestamp preserved');
check(item($reconfirmed, 'communication_preference')['visibility'] === 'friends', 'reconfirmation preserves privacy');
rejects(fn() => $service->reconfirm(1, 1, $global, 3, [$phoneId]), 409, 'stale reconfirm rejected');
rejects(fn() => $service->reconfirm(1, 1, $global, 4, []), 422, 'empty reconfirm rejected');

$delete = $service->startDraft(1, 1, $global, 'manual');
$delete = $service->updateDraft(1, 1, $global, $delete['id'], 1, [['op' => 'delete', 'attribute_id' => $phoneId]]);
$deleted = $service->confirmDraft(1, 1, $global, $delete['id'], 2, 4);
check(!in_array('contact_phone', array_column($deleted['profile']['attributes'], 'key'), true), 'explicit delete removes current item');
check(!isset($repo->native[1]['contact_phone']), 'delete clears native backing value');
check(item($service->getRevision(1, 1, $global, 4), 'contact_phone')['value'] === '+86 138 0000 0000', 'deletion preserves historical value');
check($deleted['profile']['permission_version'] === $reconfirmed['permission_version'] + 1, 'deletion advances permission version');

$rollback = $service->startDraft(1, 1, $global, 'manual');
$rollback = $service->updateDraft(1, 1, $global, $rollback['id'], 1, [['attribute_id' => $headlineId, 'value' => 'Must roll back']]);
$before = snapshot($repo);
foreach (['insertRevision', 'saveState', 'saveDraft'] as $failure) {
    $repo->failOn = $failure;
    try { $service->confirmDraft(1, 1, $global, $rollback['id'], 2, 5); check(false, 'failure must throw'); } catch (RuntimeException $e) { check(str_contains($e->getMessage(), 'Synthetic adapter failure'), 'synthetic failure propagated'); }
    check(snapshot($repo) === $before, $failure . ' rolls back native fields, rows, revision and draft');
}
$repo->failOn = null;
$rolledForward = $service->confirmDraft(1, 1, $global, $rollback['id'], 2, 5);
check($rolledForward['confirmed_revision'] === 6, 'retry after rolled-back transaction creates one revision');
check(count(array_filter($repo->lockLog, fn($entry) => str_starts_with($entry, 'state:'))) > 0 && count(array_filter($repo->lockLog, fn($entry) => str_starts_with($entry, 'draft:'))) > 0, 'confirmation requests state and draft locks');

$proposal = $service->adminProposal(9, 1, $global, [['attribute_id' => $headlineId, 'value' => 'Owner-adopted administrator suggestion']]);
check($proposal['origin'] === 'admin_proposal' && $proposal['initiator_id'] === 9, 'administrator origin and initiator retained');
check(item($service->getProfile(1, 1, $global), 'headline')['value'] === 'Must roll back', 'administrator proposal not applied automatically');
rejects(fn() => $service->confirmDraft(9, 1, $global, $proposal['id'], 1, 6), 403, 'administrator cannot confirm for owner');
rejects(fn() => $service->adminProposal(2, 1, $global, [['key' => 'bio', 'value' => 'unauthorized']]), 403, 'ordinary user cannot propose as admin');
$adopted = $service->confirmDraft(1, 1, $global, $proposal['id'], 1, 6);
check(item($adopted['profile'], 'headline')['value'] === 'Owner-adopted administrator suggestion', 'owner adopts admin proposal');

$event = $service->startDraft(1, 1, $space10);
$event = $service->updateDraft(1, 1, $space10, $event['id'], 1, [
    ['key' => 'event_goal', 'value' => ['free_text' => 'Build the prototype']],
    ['key' => 'event_role', 'value' => ['code' => 'backend', 'label' => 'Backend']],
    ['key' => 'event_time_commitment', 'value' => ['period' => 'event', 'hours_max' => 24]],
]);
rejects(fn() => $service->updateDraft(1, 1, $space10, $event['id'], 2, [['key' => 'personality', 'value' => ['traits' => ['global']]]]), 422, 'enduring personality cannot bind Space');
rejects(fn() => $service->getDraft(1, 1, $space20, $event['id']), 404, 'draft cannot cross Space');
$access->memberships[10] = [2];
rejects(fn() => $service->getDraft(1, 1, $space10, $event['id']), 403, 'membership rechecked on draft read');
rejects(fn() => $service->confirmDraft(1, 1, $space10, $event['id'], 2, 0), 403, 'membership rechecked on confirmation');
$access->memberships[10] = [1, 2];
$eventResult = $service->confirmDraft(1, 1, $space10, $event['id'], 2, 0);
check($eventResult['profile']['scope'] === 'space:10' && count($eventResult['profile']['attributes']) === 3, 'Space context persisted under native Space ID');
check($service->getProfile(1, 1, $space20)['attributes'] === [], 'new Space local preferences start empty');
check(item($service->getProfile(1, 1, $global), 'communication_preference')['value']['codes'] === ['async'], 'global habits remain reusable across Spaces');
check(count($service->getProfile(2, 1, $space10, 10)['attributes']) === 3, 'formal co-members can view confirmed Space profile');
rejects(fn() => $service->getProfile(2, 1, $space10, 20), 403, 'server Space context cannot mismatch scope');

$qr = $service->startDraft(1, 1, $global);
foreach (['qr:synthetic:other', 'qr:synthetic:pending', 'qr:synthetic:missing'] as $ref) {
    rejects(fn() => $service->updateDraft(1, 1, $global, $qr['id'], 1, [['key' => 'contact_wechat_qr', 'value' => ['file_ref' => $ref]]]), 422, 'QR requires ready owner resource');
}
$qr = $service->updateDraft(1, 1, $global, $qr['id'], 1, [['key' => 'contact_wechat_qr', 'value' => ['file_ref' => 'qr:synthetic:owner-one']]]);
$resources->resources['qr:synthetic:owner-one']['ready'] = false;
rejects(fn() => $service->confirmDraft(1, 1, $global, $qr['id'], 2, 7), 422, 'QR ownership/readiness rechecked at confirmation');
$resources->resources['qr:synthetic:owner-one']['ready'] = true;
$qrResult = $service->confirmDraft(1, 1, $global, $qr['id'], 2, 7);
check(item($qrResult['profile'], 'contact_wechat_qr')['visibility'] === 'authenticated', 'confirmed owner QR defaults visible');

$access->maintenance = true;
$before = snapshot($repo);
rejects(fn() => $service->startDraft(1, 1, $global), 503, 'maintenance blocks draft creation');
rejects(fn() => $service->updateDraft(1, 1, $global, $qr['id'], 2, []), 503, 'maintenance blocks updates');
rejects(fn() => $service->confirmDraft(1, 1, $global, $qr['id'], 2, 7), 503, 'maintenance blocks confirmation including receipt retry');
rejects(fn() => $service->reconfirm(1, 1, $global, 8, [$headlineId]), 503, 'maintenance blocks reconfirmation');
rejects(fn() => $service->adminProposal(9, 1, $global, [['key' => 'bio', 'value' => 'blocked']]), 503, 'maintenance blocks administrator proposals');
check(snapshot($repo) === $before, 'maintenance writes no mutations');
check($service->getProfile(1, 1, $global)['revision'] === 8, 'maintenance permits reads');
$access->maintenance = false;

$optional = $service->startDraft(3, 3, $global);
$optional = $service->updateDraft(3, 3, $global, $optional['id'], 1, [['key' => 'project', 'value' => []]]);
check($optional['draft_version'] === 2, 'incomplete optional object can be saved as draft');
rejects(fn() => $service->confirmDraft(3, 3, $global, $optional['id'], 2, 0), 422, 'present project needs title on confirmation');
$projectId = $optional['fields'][0]['attribute_id'];
$optional = $service->updateDraft(3, 3, $global, $optional['id'], 2, [['attribute_id' => $projectId, 'value' => ['title' => 'Only this optional field']]]);
$onlyProject = $service->confirmDraft(3, 3, $global, $optional['id'], 3, 0);
check(count($onlyProject['profile']['attributes']) === 1, 'no unrelated mandatory ordinary fields');
$limits = $service->startDraft(3, 3, $global);
rejects(fn() => $service->updateDraft(3, 3, $global, $limits['id'], 1, [['key' => 'headline', 'value' => 'one'], ['key' => 'headline', 'value' => 'two']]), 422, 'one-cardinality enforced');
rejects(fn() => $service->updateDraft(3, 3, $global, $limits['id'], 1, [['key' => 'skill', 'value' => ['code' => 'php', 'label' => 'PHP']], ['key' => 'skill', 'value' => ['code' => 'php', 'label' => 'Duplicate PHP']]]), 422, 'duplicate codes rejected before database');
$tooMany = array_fill(0, 100, ['key' => 'project', 'value' => ['title' => 'Synthetic bounded record']]);
rejects(fn() => $service->updateDraft(3, 3, $global, $limits['id'], 1, $tooMany), 422, 'many-cardinality bounded at 100');
rejects(fn() => $service->updateDraft(3, 3, $global, $limits['id'], 1, [['key' => 'portfolio_link', 'value' => ['url' => 'https://example.test', 'label' => 'Proof', 'project_ref' => $headlineId]]]), 422, 'project link ownership checked');
$limits = $service->updateDraft(3, 3, $global, $limits['id'], 1, [['key' => 'bio', 'value' => 'Temporary draft addition']]);
$newId = $limits['fields'][0]['attribute_id'];
$limits = $service->updateDraft(3, 3, $global, $limits['id'], 2, [['op' => 'delete', 'attribute_id' => $newId]]);
check($limits['fields'] === [], 'deleting unconfirmed addition removes draft operation only');
check(count($service->getProfile(3, 3, $global)['attributes']) === 1, 'draft cancellation preserves confirmed current profile');
$native = $service->startDraft(3, 3, $global, 'native_edit');
check($native['id'] !== $limits['id'], 'native editing uses isolated draft origin');
$native = $service->updateDraft(3, 3, $global, $native['id'], 1, [['key' => 'bio', 'value' => 'Keep this draft unconfirmed']]);
$freshNative = $service->startDraft(3, 3, $global, 'native_edit', false);
check($freshNative['id'] !== $native['id'] && $freshNative['fields'] === [], 'direct native save explicitly creates a fresh draft');
$freshNative = $service->updateDraft(3, 3, $global, $freshNative['id'], 1, [['key' => 'headline', 'value' => 'Confirm this direct edit only']]);
$freshResult = $service->confirmDraft(3, 3, $global, $freshNative['id'], 2, 1);
check(!in_array('bio', array_column($freshResult['profile']['attributes'], 'key'), true), 'direct save cannot publish older unconfirmed draft content');
check($service->getDraft(3, 3, $global, $native['id'])['fields'][0]['value'] === 'Keep this draft unconfirmed', 'fresh save preserves the prior draft');
rejects(fn() => $service->confirmDraft(3, 3, $global, $native['id'], 2, 1), 409, 'prior draft reports changed base after direct save');

foreach ([
    'read' => fn() => $service->getProfile(1, 1, $global),
    'start' => fn() => $service->startDraft(1, 1, $global, 'manual', false),
    'confirmation retry' => fn() => $service->confirmDraft(1, 1, $global, $qr['id'], 2, 7),
] as $label => $action) {
    $beforeWait = snapshot($repo);
    $repo->onStateLocked = static function () use ($access): void { $access->users = [2, 3, 9]; };
    rejects($action, 403, $label . ' rechecks active owner after state lock wait');
    check(snapshot($repo) === $beforeWait, $label . ' lock-wait revocation does not mutate profile');
    $repo->onStateLocked = null;
    $access->users = [1, 2, 3, 9];
}

echo json_encode(['status' => 'passed', 'checks' => $checks, 'database_calls' => 0, 'model_calls' => 0, 'areas' => ['optional contacts', 'owner-only drafts', 'Space membership', 'stable repeatable IDs', 'partial confirmation', 'dual versions', 'idempotency', 'history', 'rollback', 'administrator adoption', 'QR ownership', 'maintenance']], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
