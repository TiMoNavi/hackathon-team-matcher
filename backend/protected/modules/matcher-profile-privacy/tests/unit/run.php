<?php
declare(strict_types=1);

$modules = dirname(__DIR__, 3);
spl_autoload_register(static function (string $class) use ($modules): void {
    foreach (['matcherProfile' => 'matcher-user-profile', 'matcherPrivacy' => 'matcher-profile-privacy'] as $ns => $directory) {
        $prefix = 'humhub\\modules\\' . $ns . '\\';
        if (str_starts_with($class, $prefix)) {
            $path = $modules . '/' . $directory . '/' . str_replace(chr(92), '/', substr($class, strlen($prefix))) . '.php';
            if (is_file($path)) { require $path; }
        }
    }
});

use humhub\modules\matcherProfile\application\ProfileService;
use humhub\modules\matcherProfile\application\IdentityService;
use humhub\modules\matcherProfile\application\interfaces\IdentityStore;
use humhub\modules\matcherProfile\application\interfaces\ProfileMediaStore;
use humhub\modules\matcherProfile\adapters\memory\InMemoryProfileRepository;
use humhub\modules\matcherProfile\adapters\memory\InMemoryProfileAccessPolicy;
use humhub\modules\matcherProfile\adapters\memory\InMemoryProfileResourcePolicy;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherPrivacy\application\PrivacyService;
use humhub\modules\matcherPrivacy\application\ProfileReadPolicy;
use humhub\modules\matcherPrivacy\adapters\memory\InMemoryProfileRelations;
use humhub\modules\matcherPrivacy\domain\ReadContext;
use humhub\modules\matcherPrivacy\domain\VisibilityPolicy;

$checks = [];
function check(bool $condition, string $label): void { global $checks; if (!$condition) { throw new RuntimeException('FAILED: ' . $label); } $checks[] = $label; }
function rejects(callable $action, int $status, string $label): void {
    try { $action(); } catch (ProfileException $error) { check($error->httpStatus === $status, $label . ' status=' . $error->httpStatus); return; }
    check(false, $label . ' did not reject');
}
function keys(array $profile): array { return array_column($profile['attributes'], 'key'); }
function item(array $profile, string $key): array { foreach ($profile['attributes'] as $item) { if ($item['key'] === $key) { return $item; } } throw new RuntimeException('Missing test attribute ' . $key); }
function save(ProfileService $service, ProfileScope $scope, array $operations): array {
    $draft = $service->startDraft(1, 1, $scope, 'manual', false);
    $draft = $service->updateDraft(1, 1, $scope, $draft['id'], $draft['draft_version'], $operations);
    return $service->confirmDraft(1, 1, $scope, $draft['id'], $draft['draft_version'], $draft['base_revision'])['profile'];
}

$repo = new InMemoryProfileRepository();
$access = new InMemoryProfileAccessPolicy();
$access->users = [1, 2, 3, 4]; $access->memberships = [10 => [1, 2, 3], 20 => [1, 3]];
$relations = new InMemoryProfileRelations();
$relations->activeUsers = $access->users; $relations->memberships = $access->memberships;
$relations->friendships = [[1, 3], [3, 1]];
$relations->posts = [77 => ['owner_id' => 1, 'viewers' => [2, 3, 4], 'visible' => true]];
$resources = new InMemoryProfileResourcePolicy();
$resources->resources = ['qr:owner' => ['owner_id' => 1, 'kind' => 'contact_qr', 'ready' => true]];
$clock = '2026-11-11 12:00:00';
$policy = new ProfileReadPolicy($relations, $repo);
$service = new ProfileService($repo, $access, $resources, static function () use (&$clock): string { return $clock; }, $policy);
$privacy = new PrivacyService($service, $policy, $repo);
$global = ProfileScope::global(); $space10 = ProfileScope::event(10); $space20 = ProfileScope::event(20);
$spaceEntry = ['entry_type' => 'space', 'space_id' => 10, 'purpose' => 'detail'];
$friendEntry = ['entry_type' => 'friendship', 'purpose' => 'detail'];
$postEntry = ['entry_type' => 'public_post', 'post_id' => 77, 'purpose' => 'detail'];
$current = save($service, $global, [
    ['key' => 'headline', 'value' => 'Synthetic teammate'],
    ['key' => 'bio', 'value' => 'Synthetic private bio', 'visibility' => 'private'],
    ['key' => 'communication_preference', 'value' => ['codes' => ['async']], 'visibility' => 'friends'],
    ['key' => 'contact_wechat', 'value' => 'synthetic_wechat'],
    ['key' => 'contact_qq', 'value' => '123456789', 'visibility' => 'friends'],
    ['key' => 'contact_phone', 'value' => '+86 138 0000 0000', 'visibility' => 'private'],
    ['key' => 'contact_wechat_qr', 'value' => ['file_ref' => 'qr:owner'], 'visibility' => 'friends'],
    ['key' => 'project', 'value' => ['title' => 'Synthetic private project'], 'visibility' => 'private'],
    ['key' => 'skill', 'value' => ['code' => 'php', 'label' => 'PHP']],
]);
$projectId = item($current, 'project')['attribute_id'];
$current = save($service, $global, [['key' => 'portfolio_link', 'value' => ['url' => 'https://example.test/work', 'label' => 'Synthetic work', 'project_ref' => $projectId]]]);
$owner = $service->getProfile(1, 1, $global);
check(count($owner['attributes']) === 10, 'owner current profile keeps all ordinary attributes');
check(count($owner['field_definitions']) === 27, 'owner editing keeps full global field catalogue');
check(item($owner, 'contact_wechat')['visibility'] === 'authenticated', 'new contact stays default authenticated');

$visible = $privacy->read(2, 1, $global, $spaceEntry);
check(keys($visible) === ['headline', 'skill', 'portfolio_link'], 'same Space member sees authenticated ordinary fields');
check(array_column($visible['field_definitions'], 'key') === ['headline', 'skill', 'portfolio_link'], 'hidden field keys absent from projected definitions');
check(!isset(item($visible, 'portfolio_link')['value']['project_ref']), 'public portfolio does not reveal hidden project reference');
check(!isset($visible['editing_draft'], $visible['legacy_candidates']), 'other read has no owner edit materials');
check(!str_contains(json_encode($visible), 'Synthetic private'), 'private values absent from entire projected response');
check(!in_array('contact_wechat', keys($visible), true), 'contact values separated from ordinary details');
$friend = $privacy->read(3, 1, $global, $friendEntry);
check(in_array('communication_preference', keys($friend), true), 'mutual friend reads friends scope');
check(!in_array('bio', keys($friend), true), 'friend cannot read private bio');
$contacts = $privacy->contacts(2, 1, $spaceEntry);
check(keys($contacts) === ['contact_wechat'], 'independent contacts endpoint preserves authenticated default');
$friendContacts = $privacy->contacts(3, 1, $friendEntry);
check(keys($friendContacts) === ['contact_wechat', 'contact_qq', 'contact_wechat_qr'], 'friend contact projection uses same visibility policy');
check(count($privacy->contacts(1, 1, ['entry_type' => 'self'])['attributes']) === 4, 'owner can manage all confirmed contacts');
$postReader = $privacy->read(4, 1, $global, $postEntry);
check(keys($postReader) === keys($visible), 'accessible public author can be read across Spaces');
check(keys($privacy->contacts(4, 1, $postEntry)) === ['contact_wechat'], 'public author legitimate entry uses same contact defaults');
rejects(fn() => $privacy->read(4, 1, $global, $friendEntry), 403, 'arbitrary target ID without relationship rejected');
rejects(fn() => $privacy->read(4, 1, $global, $spaceEntry), 403, 'outsider current Space cannot be claimed');
rejects(fn() => $privacy->read(4, 1, $global, ['entry_type' => 'self']), 403, 'self entry cannot impersonate owner');
rejects(fn() => $privacy->read(4, 1, $global, ['entry_type' => 'identity']), 403, 'identity card entry cannot read ordinary profile');
rejects(fn() => $privacy->read(0, 1, $global, $postEntry), 401, 'anonymous ordinary profile rejected');
rejects(fn() => ReadContext::fromArray(['entry_type' => 'space', 'space_id' => '10']), 422, 'unvalidated context IDs rejected');
rejects(fn() => ReadContext::fromArray(['entry_type' => 'space', 'space_id' => 10, 'is_friend' => true]), 422, 'client relationship flag rejected');
rejects(fn() => ReadContext::fromArray(['entry_type' => 'public_post']), 422, 'public author entry requires exact post');
rejects(fn() => $privacy->read(4, 1, $global, ['entry_type' => 'public_post', 'post_id' => 78]), 403, 'unknown public post rejected');
$relations->posts[77]['visible'] = false;
rejects(fn() => $privacy->read(4, 1, $global, $postEntry), 403, 'post withdrawal revokes author entry immediately');
$relations->posts[77]['visible'] = true;
$relations->posts[77]['owner_id'] = 2;
rejects(fn() => $privacy->read(4, 1, $global, $postEntry), 403, 'public post cannot authenticate a different author');
$relations->posts[77]['owner_id'] = 1;

$discovery = $privacy->read(3, 1, $global, ['entry_type' => 'space', 'space_id' => 10, 'purpose' => 'discovery']);
check(!in_array('communication_preference', keys($discovery), true), 'discovery excludes friends fields even for actual friends');
check(keys($discovery) === keys($visible), 'discovery excludes contacts and private fields');
rejects(fn() => $privacy->read(3, 1, $global, ['entry_type' => 'friendship', 'purpose' => 'discovery']), 403, 'friend entry does not create cross Space discovery');
rejects(fn() => $privacy->read(4, 1, $global, ['entry_type' => 'public_post', 'post_id' => 77, 'purpose' => 'summary']), 403, 'public author entry does not create global list summary');
save($service, $space10, [['key' => 'event_goal', 'value' => ['free_text' => 'Synthetic Space ten goal']]]);
save($service, $space20, [['key' => 'event_goal', 'value' => ['free_text' => 'Synthetic Space twenty goal']]]);
check(item($privacy->read(2, 1, $space10, $spaceEntry), 'event_goal')['value']['free_text'] === 'Synthetic Space ten goal', 'Space ten context reads its own data');
rejects(fn() => $privacy->read(2, 1, $space20, $spaceEntry), 403, 'Space ten entry cannot read Space twenty preferences');
rejects(fn() => $privacy->read(3, 1, $space20, $friendEntry), 403, 'friend entry still needs the exact Space for Space fields');
check(item($privacy->read(3, 1, $space20, ['entry_type' => 'friendship', 'space_id' => 20]), 'event_goal')['value']['free_text'] === 'Synthetic Space twenty goal', 'friend plus exact shared Space reads its contextual fields');
unset($relations->memberships[10][array_search(3, $relations->memberships[10], true)]);
check(in_array('communication_preference', keys($privacy->read(3, 1, $global, $friendEntry)), true), 'global friendship read survives leaving a Space');
rejects(fn() => $privacy->read(3, 1, $space10, ['entry_type' => 'friendship', 'space_id' => 10]), 403, 'global friendship does not bypass missing Space membership');
$relations->memberships[10][] = 3;

$draft = $service->startDraft(1, 1, $global);
$draft = $service->updateDraft(1, 1, $global, $draft['id'], 1, [['key' => 'interest', 'value' => ['code' => 'robotics', 'label' => 'Synthetic pending interest']], ['attribute_id' => item($owner, 'bio')['attribute_id'], 'value' => 'Synthetic new private bio']]);
check(!in_array('interest', keys($privacy->read(2, 1, $global, $spaceEntry)), true), 'pending draft never enters real visitor projection');
foreach (['owner', 'authenticated', 'friends'] as $perspective) {
    $preview = $privacy->preview(1, $global, $perspective, $draft['id']);
    check($preview['simulated'] === true && $preview['perspective'] === $perspective, $perspective . ' preview clearly marked simulated');
    check(in_array('interest', keys($preview['profile']), true), $perspective . ' draft preview can show proposed authenticated value');
    check(in_array('bio', keys($preview['profile']), true) === ($perspective === 'owner'), $perspective . ' preview applies private rule');
    check(in_array('communication_preference', keys($preview['profile']), true) === ($perspective !== 'authenticated'), $perspective . ' preview applies friends rule');
}
rejects(fn() => $privacy->preview(2, $global, 'owner', $draft['id']), 404, 'viewer cannot preview another owner draft');
rejects(fn() => $privacy->preview(1, $global, 'stranger'), 422, 'unknown preview perspective rejected');
check(!in_array('interest', keys($privacy->preview(1, $global, 'authenticated')['profile']), true), 'current preview does not silently adopt draft');
$draftBefore = $repo->drafts; $nativeBefore = $repo->native;
$before = $service->getProfile(1, 1, $global); $oldRevision = $before['revision'];
$headlineId = item($before, 'headline')['attribute_id']; $oldConfirmedAt = item($before, 'headline')['last_confirmed_at'];
$clock = '2026-11-11 13:00:00';
$changed = $privacy->changeVisibility(1, $global, $oldRevision, [['attribute_id' => $headlineId, 'visibility' => 'friends']]);
check($changed['revision'] === $oldRevision + 1 && $changed['permission_version'] === $before['permission_version'] + 1, 'privacy confirmation advances profile and permission versions');
check(item($changed, 'headline')['last_confirmed_at'] === $oldConfirmedAt, 'privacy-only change preserves content confirmation time');
check($repo->drafts === $draftBefore, 'privacy-only change preserves every pending draft');
check($repo->native === $nativeBefore, 'privacy-only change preserves native values');
check(!in_array('headline', keys($privacy->read(2, 1, $global, $spaceEntry)), true), 'visibility restriction takes effect on next read');
check(in_array('headline', keys($privacy->read(3, 1, $global, $friendEntry)), true), 'friend continues seeing friends field');
check(item($service->getRevision(1, 1, $global, $oldRevision), 'headline')['visibility'] === 'authenticated', 'historical version stays immutable');
rejects(fn() => $privacy->changeVisibility(1, $global, $oldRevision, [['attribute_id' => $headlineId, 'visibility' => 'private']]), 409, 'stale visibility version rejected');
rejects(fn() => $privacy->changeVisibility(1, $global, $changed['revision'], [['attribute_id' => $headlineId, 'visibility' => 'public']]), 422, 'unsupported visibility rejected');
rejects(fn() => $privacy->changeVisibility(1, $global, $changed['revision'], [['attribute_id' => $headlineId, 'visibility' => 'private', 'value' => 'injected']]), 422, 'privacy endpoint cannot change content');
rejects(fn() => $privacy->changeVisibility(1, $global, $changed['revision'], [['attribute_id' => $headlineId, 'visibility' => 'private'], ['attribute_id' => $headlineId, 'visibility' => 'authenticated']]), 422, 'duplicate visibility target rejected');
rejects(fn() => $privacy->changeVisibility(1, $global, $changed['revision'], [['attribute_id' => $draft['fields'][0]['attribute_id'], 'visibility' => 'private']]), 422, 'pending-only attribute cannot be published via privacy');
check($privacy->changeVisibility(1, $global, $changed['revision'], [['attribute_id' => $headlineId, 'visibility' => 'friends']])['revision'] === $changed['revision'], 'unchanged visibility is a true no-op');
$stateBefore = serialize([$repo->states, $repo->attributes, $repo->revisions, $repo->native]);
$repo->failOn = 'insertRevision';
try { $privacy->changeVisibility(1, $global, $changed['revision'], [['attribute_id' => $headlineId, 'visibility' => 'private']]); check(false, 'failure injection'); }
catch (RuntimeException $error) { check(str_contains($error->getMessage(), 'Synthetic adapter'), 'synthetic persistence failure reached'); }
check(serialize([$repo->states, $repo->attributes, $repo->revisions, $repo->native]) === $stateBefore, 'privacy change transaction rolls back atomically');
$repo->failOn = null;

$relations->friendships = [[1, 3]];
rejects(fn() => $privacy->read(3, 1, $global, $friendEntry), 403, 'one-way pending friendship is not mutual friendship');
check(!in_array('communication_preference', keys($privacy->read(3, 1, $global, $spaceEntry)), true), 'friend removal immediately removes friends fields at other valid entries');
$relations->friendships = [[1, 3], [3, 1]];
check(in_array('communication_preference', keys($privacy->read(3, 1, $global, $spaceEntry)), true), 'new effective friendship dynamically reveals friends fields');
$relations->blockedPairs = [[1, 3]];
rejects(fn() => $privacy->read(3, 1, $global, $friendEntry), 403, 'owner block wins over friendship');
rejects(fn() => $privacy->contacts(3, 1, $spaceEntry), 403, 'block wins over shared Space contacts');
$relations->blockedPairs = [[4, 1]];
rejects(fn() => $privacy->read(4, 1, $global, $postEntry), 403, 'viewer block wins over public post entry');
$relations->blockedPairs = [];
$relations->activeUsers = [1, 2, 3];
rejects(fn() => $privacy->read(4, 1, $global, $postEntry), 403, 'inactive viewer cannot use prior entry');
$relations->activeUsers = [1, 2, 3, 4];
$repo->onStateLocked = static function () use ($relations): void { $relations->blockedPairs = [[1, 2]]; };
rejects(fn() => $privacy->read(2, 1, $global, $spaceEntry), 403, 'authorization rechecked after waiting for profile lock');
$repo->onStateLocked = null; $relations->blockedPairs = [];

$store = new class($repo) implements IdentityStore {
    public function __construct(private InMemoryProfileRepository $repo) {}
    public function transaction(callable $callback): mixed { return $this->repo->transaction($callback); }
    public function state(int $ownerId, bool $lock = false): ?array { return $this->repo->findState($ownerId, ProfileScope::global(), $lock); }
    public function media(string $ref): ?array { return in_array($ref, ['qr:owner', 'avatar:owner', 'avatar:old'], true) ? ['owner_id' => 1, 'kind' => str_starts_with($ref, 'qr:') ? 'contact_qr' : 'avatar', 'file_ref' => $ref] : null; }
    public function isConfirmedQr(int $ownerId, string $ref): bool { return false; }
    public function ensureState(int $ownerId, string $now): array { throw new LogicException('Unused'); }
    public function saveState(array $state): void { throw new LogicException('Unused'); }
    public function nickname(int $ownerId): ?string { return 'Synthetic owner'; }
    public function saveNickname(array $state, string $nickname, string $now): void { throw new LogicException('Unused'); }
    public function saveMedia(array $state, string $id, array $metadata, string $now): void { throw new LogicException('Unused'); }
    public function recordChange(array $state, array $change, int $baseVersion, string $now): void { throw new LogicException('Unused'); }
    public function refresh(int $ownerId): void {}
};
$files = new class implements ProfileMediaStore {
    public function stage(string $temporaryPath, string $kind, string $id): array { throw new LogicException('Unused'); }
    public function discard(string $id): void { throw new LogicException('Unused'); }
    public function assertReady(array $metadata): void {}
    public function path(array $metadata, string $variant): string { return 'synthetic://' . $metadata['file_ref'] . '/' . $variant; }
};
$identity = new IdentityService($store, $access, $files, $policy);
$globalState = $repo->findState(1, $global);
$repo->states[$globalState['id']]['identity_version'] = 1;
$repo->states[$globalState['id']]['confirmed_avatar_ref'] = 'avatar:owner';
check($identity->readMedia(3, 'qr:owner', 'main', null, $friendEntry)['mime'] === 'image/png', 'confirmed friends QR uses same privacy policy rather than legacy auth-only gate');
rejects(fn() => $identity->readMedia(2, 'qr:owner', 'main', 10), 404, 'authenticated nonfriend cannot read friends QR');
check($identity->readMedia(1, 'qr:owner')['mime'] === 'image/png', 'owner QR resource remains usable');
check($identity->readMedia(4, 'avatar:owner')['mime'] === 'image/png', 'minimal signed-in identity resource works without full profile access');
rejects(fn() => $identity->readMedia(4, 'avatar:old'), 404, 'replaced avatar reference cannot be replayed');
$relations->blockedPairs = [[1, 4]];
rejects(fn() => $identity->readMedia(4, 'avatar:owner'), 403, 'avatar media rechecks block');
$relations->blockedPairs = [];
$current = $service->getProfile(1, 1, $global);
$qrId = item($current, 'contact_wechat_qr')['attribute_id'];
$privacy->changeVisibility(1, $global, $current['revision'], [['attribute_id' => $qrId, 'visibility' => 'private']]);
rejects(fn() => $identity->readMedia(3, 'qr:owner', 'main', null, $friendEntry), 404, 'QR visibility revocation affects resource access immediately');
$repo->onStateLocked = static function () use ($relations): void { $relations->blockedPairs = [[1, 3]]; };
rejects(fn() => $identity->readMedia(3, 'avatar:owner'), 403, 'media authorization rechecks after state lock');
$repo->onStateLocked = null; $relations->blockedPairs = [];

$raw = ['attributes' => [['attribute_id' => 'x', 'key' => 'bio', 'value' => 'pending', 'visibility' => 'authenticated', 'confirmation' => 'pending'], ['attribute_id' => 'y', 'key' => 'headline', 'value' => 'visible', 'visibility' => 'authenticated', 'confirmation' => 'confirmed', 'source_text' => 'private source']]];
$projection = (new VisibilityPolicy())->project($raw, 'authenticated');
check(keys($projection) === ['headline'], 'unconfirmed attribute never enters real projection even with visible setting');
check(!str_contains(json_encode($projection), 'private source'), 'internal raw source fields removed by attribute whitelist');
check(!str_contains(json_encode($projection), 'source_text'), 'internal raw source keys removed');

$ownerSummary = (new VisibilityPolicy())->project($service->getProfile(1, 1, $global), 'owner', 'discovery');
check(!in_array('bio', keys($ownerSummary), true) && !in_array('communication_preference', keys($ownerSummary), true), 'discovery stays authenticated-only even when owner is projected');
$relations->activeUsers = [1, 2, 3, 4];
$repo->onStateLocked = static function () use ($relations): void { $relations->activeUsers = [2, 3, 4]; };
rejects(fn() => $privacy->preview(1, $global), 403, 'owner preview rechecks current active account after state lock');
$repo->onStateLocked = null; $relations->activeUsers = [1, 2, 3, 4];
$version = $service->getProfile(1, 1, $global)['revision'];
$repo->onStateLocked = static function () use ($relations): void { $relations->activeUsers = [2, 3, 4]; };
rejects(fn() => $privacy->changeVisibility(1, $global, $version, [['attribute_id' => $headlineId, 'visibility' => 'private']]), 403, 'visibility write rechecks active account using post-lock policy');
rejects(fn() => $identity->readMedia(1, 'qr:owner'), 403, 'owner resource read rechecks active account after state lock');
$repo->onStateLocked = null; $relations->activeUsers = [1, 2, 3, 4];
$repo->lockLog = [];
$orderedRelations = new class($relations, $repo) implements \humhub\modules\matcherPrivacy\domain\ports\ProfileRelations {
    public function __construct(private InMemoryProfileRelations $inner, private InMemoryProfileRepository $repo) {}
    public function assertActive(int $userId): void { if (!in_array('state:1:global', $this->repo->lockLog, true)) { throw new RuntimeException('Privacy fact locked before profile state'); } $this->inner->assertActive($userId); }
    public function isBlocked(int $viewerId, int $ownerId): bool { return $this->inner->isBlocked($viewerId, $ownerId); }
    public function areFriends(int $viewerId, int $ownerId): bool { return $this->inner->areFriends($viewerId, $ownerId); }
    public function isSpaceMember(int $userId, int $spaceId): bool { return $this->inner->isSpaceMember($userId, $spaceId); }
    public function canAccessPostAuthor(int $viewerId, int $ownerId, int $postId): bool { return $this->inner->canAccessPostAuthor($viewerId, $ownerId, $postId); }
};
$orderedService = new ProfileService($repo, $access, $resources, null, new ProfileReadPolicy($orderedRelations, $repo));
check($orderedService->getProfile(2, 1, $global, 10)['scope'] === 'global', 'state lock is acquired before any privacy fact locking read');

$beforeMetadata = $service->getProfile(1, 1, $global);
$skillBefore = item($beforeMetadata, 'skill');
$draftsBeforeMetadata = $repo->drafts;
$clock = '2026-11-11 14:00:00';
$metadataOnly = save($service, $global, [['attribute_id' => $skillBefore['attribute_id'], 'value' => ['label' => 'PHP', 'code' => 'php'], 'visibility' => 'friends', 'sort_order' => 88]]);
check(item($metadataOnly, 'skill')['last_confirmed_at'] === $skillBefore['last_confirmed_at'], 'draft-confirmed visibility and sorting changes preserve content timestamp');
check(item($metadataOnly, 'skill')['value']['code'] === 'php' && item($metadataOnly, 'skill')['visibility'] === 'friends', 'JSON object key reorder remains the same content while visibility changes');
check($repo->drafts[$draft['id']] === $draftsBeforeMetadata[$draft['id']], 'metadata confirmation leaves unrelated pending draft intact');
$contentChanged = save($service, $global, [['attribute_id' => $skillBefore['attribute_id'], 'value' => ['code' => 'php', 'label' => 'PHP backend']]]);
check(item($contentChanged, 'skill')['last_confirmed_at'] === $clock, 'actual draft content change refreshes confirmation timestamp');
$clock = '2026-11-11 15:00:00';
$reconfirmed = $service->reconfirm(1, 1, $global, $contentChanged['revision'], [$skillBefore['attribute_id']]);
check(item($reconfirmed, 'skill')['last_confirmed_at'] === $clock, 'explicit reconfirm still refreshes unchanged content timestamp');

echo json_encode(['status' => 'passed', 'passed' => count($checks), 'checks' => $checks, 'database_calls' => 0], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
