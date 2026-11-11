<?php
declare(strict_types=1);
$modules = dirname(__DIR__, 3);
spl_autoload_register(static function (string $class) use ($modules): void {
    foreach (['matcherProfile' => 'matcher-user-profile', 'matcherPrivacy' => 'matcher-profile-privacy'] as $ns => $directory) {
        $prefix = 'humhub\\modules\\' . $ns . '\\';
        if (str_starts_with($class, $prefix)) { $path = $modules . '/' . $directory . '/' . str_replace(chr(92), '/', substr($class, strlen($prefix))) . '.php'; if (is_file($path)) { require $path; } }
    }
});
use humhub\modules\matcherProfile\application\{ProfileService, ProfilePresentationService};
use humhub\modules\matcherProfile\adapters\memory\{InMemoryProfileRepository, InMemoryProfileAccessPolicy, InMemoryProfilePresentationRepository};
use humhub\modules\matcherProfile\domain\{ProfileScope, ProfileException, RelationAccessContext};
use humhub\modules\matcherPrivacy\application\{ProfileReadPolicy, PrivacyService, ProfileOverviewService, ProfileRelationService};
use humhub\modules\matcherPrivacy\adapters\memory\{InMemoryProfileRelations, InMemoryRelationSharingRepository};
use humhub\modules\matcherPrivacy\domain\ports\{CurrentProfileEntry, RelationCandidateSource};
use humhub\modules\matcherPrivacy\domain\RelationCursor;

$checks = [];
function ok(bool $test, string $label): void { global $checks; if (!$test) { throw new RuntimeException('FAILED: ' . $label); } $checks[] = $label; }
function deny(callable $fn, int $status, string $label): void { try { $fn(); } catch (ProfileException $e) { ok($e->httpStatus === $status, $label . ' status=' . $e->httpStatus); return; } throw new RuntimeException('FAILED: ' . $label); }
function commit(ProfileService $service, ProfileScope $scope, array $ops): array { $d = $service->startDraft(1, 1, $scope, 'manual', false); $d = $service->updateDraft(1, 1, $scope, $d['id'], $d['draft_version'], $ops); return $service->confirmDraft(1, 1, $scope, $d['id'], $d['draft_version'], $d['base_revision'])['profile']; }

$repo = new InMemoryProfileRepository(); $access = new InMemoryProfileAccessPolicy(); $access->users = [1, 2, 3]; $access->memberships = [10 => [1, 2, 3], 20 => [1, 2]];
$relations = new InMemoryProfileRelations(); $relations->activeUsers = $access->users; $relations->memberships = $access->memberships;
$policy = new ProfileReadPolicy($relations, $repo); $profiles = new ProfileService($repo, $access, null, null, $policy); $privacy = new PrivacyService($profiles, $policy, $repo);
$presentation = new InMemoryProfilePresentationRepository(); $present = new ProfilePresentationService($repo, $presentation, $access);
$entry = new class($relations) implements CurrentProfileEntry {
    public int $space = 10; public array $discoverable = [1 => true, 2 => false]; public int $calls = 0; public ?Closure $hook = null;
    public function __construct(public InMemoryProfileRelations $relations) {}
    public function resolve(int $viewerId, int $ownerId, int $spaceId): array {
        ++$this->calls; if ($this->hook) { ($this->hook)($this->calls); }
        $this->relations->assertActive($viewerId); $this->relations->assertActive($ownerId);
        if ($spaceId !== $this->space || !$this->relations->isSpaceMember($viewerId, $spaceId) || !$this->relations->isSpaceMember($ownerId, $spaceId) || $this->relations->isBlocked($viewerId, $ownerId) || ($viewerId !== $ownerId && !($this->discoverable[$ownerId] ?? false))) { throw new ProfileException('PROFILE_ACCESS_DENIED', 'Denied', 403); }
        return ['version' => (string)$this->space, 'friend' => $this->relations->areFriends($viewerId, $ownerId)];
    }
};
$overview = new ProfileOverviewService($privacy, $presentation, $entry);
$global = ProfileScope::global();
$saved = commit($profiles, $global, [
    ['key' => 'education', 'value' => ['school' => 'Synthetic school A'], 'visibility' => 'friends'],
    ['key' => 'education', 'value' => ['school' => 'Synthetic school B']],
    ['key' => 'portfolio_link', 'value' => ['url' => 'https://example.test/primary', 'label' => 'Primary'], 'visibility' => 'friends'],
    ['key' => 'portfolio_link', 'value' => ['url' => 'https://example.test/additional', 'label' => 'Additional']],
    ['key' => 'skill', 'value' => ['code' => 'php', 'label' => 'PHP']],
    ['key' => 'contact_email', 'value' => 'synthetic-contact@example.test'],
    ['key' => 'bio', 'value' => 'Synthetic private bio', 'visibility' => 'private'],
]);
$schools = array_values(array_filter($saved['attributes'], fn($a) => $a['key'] === 'education')); $links = array_values(array_filter($saved['attributes'], fn($a) => $a['key'] === 'portfolio_link'));
$presentation->nativePrimaryIds[1] = $links[0]['attribute_id'];
commit($profiles, ProfileScope::event(10), [['key' => 'event_goal', 'value' => ['free_text' => 'Synthetic ten goal']]]);
commit($profiles, ProfileScope::event(20), [['key' => 'event_goal', 'value' => ['free_text' => 'Synthetic twenty goal']]]);
ok($present->read(1)['primary_portfolio_attribute_id'] === $links[0]['attribute_id'], 'initial primary references native binding');
$selected = $present->save(1, 0, $schools[0]['attribute_id'], $links[0]['attribute_id']);
ok($selected['version'] === 1, 'display settings version independently');
deny(fn() => $present->save(1, 0, null, null), 409, 'stale presentation CAS rejected');
deny(fn() => $present->save(1, 1, $links[0]['attribute_id'], null), 422, 'wrong selected field kind rejected');
deny(fn() => $present->save(2, 0, $schools[0]['attribute_id'], null), 422, 'other owner attribute rejected');
$view = $overview->read(2, 1, 10);
ok($view['school_overview'] === null && $view['primary_portfolio_link'] === null, 'hidden selected school and homepage do not fall back');
ok(count($view['additional_portfolio_links']) === 1, 'separately authorized additional works still available');
ok($view['global']['scope'] === 'global' && $view['space']['space_id'] === 10, 'global and Space remain separate');
ok(!str_contains(json_encode($view), 'Synthetic twenty'), 'overview does not expose another Space');
ok(!str_contains(json_encode($view), 'synthetic-contact') && !str_contains(json_encode($view), 'contact_email'), 'overview excludes contact fields and values');
ok(!str_contains(json_encode($view), 'Synthetic private bio'), 'private bio absent');
$relations->friendships = [[1, 2], [2, 1]]; $view = $overview->read(2, 1, 10);
ok($view['school_overview']['value']['school'] === 'Synthetic school A' && $view['primary_portfolio_link']['attribute_id'] === $links[0]['attribute_id'], 'real friends see selected friends values in legal detail');
$discovery = $privacy->read(2, 1, $global, ['entry_type' => 'space', 'space_id' => 10, 'purpose' => 'discovery']);
ok(!in_array($schools[0]['attribute_id'], array_column($discovery['attributes'], 'attribute_id'), true), 'friends fields remain excluded from discovery');
$relations->friendships = [];
$present->save(1, 1, null, null); $view = $overview->read(1, 1, 10);
ok($view['school_overview'] === null && $view['primary_portfolio_link'] === null && count($view['additional_portfolio_links']) === 2, 'explicit null retains no school or primary even for owner');
$present->save(1, 2, $schools[0]['attribute_id'], $links[0]['attribute_id']);
commit($profiles, $global, [['op' => 'delete', 'attribute_id' => $schools[0]['attribute_id']], ['op' => 'delete', 'attribute_id' => $links[0]['attribute_id']]]);
$view = $overview->read(1, 1, 10);
ok($view['school_overview'] === null && $view['primary_portfolio_link'] === null, 'deleted selection never falls back');
ok($present->read(1)['education_attribute_id'] === $schools[0]['attribute_id'], 'deleted selected ID retained without duplicate values');
$draft = $profiles->startDraft(1, 1, $global, 'manual', false); $draft = $profiles->updateDraft(1, 1, $global, $draft['id'], $draft['draft_version'], [['key' => 'education', 'value' => ['school' => 'Synthetic unconfirmed school']]]);
ok(!str_contains(json_encode($overview->read(1, 1, 10)), 'Synthetic unconfirmed'), 'owner overview is confirmed-only');
deny(fn() => $overview->read(2, 1, 20), 403, 'route cannot select another current Space');
$entry->discoverable[1] = false; deny(fn() => $overview->read(2, 1, 10), 403, 'owner discovery optout revokes current-card entry');
ok($overview->read(1, 1, 10)['owner_id'] === 1, 'self overview does not require discoverability'); $entry->discoverable[1] = true;
ok($overview->read(2, 1, 10)['owner_id'] === 1, 'viewer optout does not prevent browsing');
$entry->calls = 0; $entry->hook = function(int $call) use ($entry) { if ($call === 2) { $entry->discoverable[1] = false; } };
deny(fn() => $overview->read(2, 1, 10), 403, 'overview rechecks optout after reads'); $entry->hook = null; $entry->discoverable[1] = true;

$source = new class implements RelationCandidateSource {
    public array $items = []; public ?Closure $hook = null; public int $calls = 0; public bool $fail = false;
    public function readCandidates(int $viewerId, int $ownerId, int $spaceId, string $kind): array { ++$this->calls; if ($this->hook) { ($this->hook)($this->calls); } if ($this->fail) { throw new RuntimeException('Synthetic source failure'); } return $this->items[$kind] ?? []; }
};
for ($i = 1; $i <= 51; ++$i) { $source->items['idea_groups'][] = ['kind' => 'idea_group', 'id' => (string)$i, 'idea_id' => (string)$i, 'title' => 'Synthetic idea ' . $i, 'summary' => 'Formal synthetic summary', 'href' => '/api/v1/ideas/' . $i . '?idea_activity_id=' . $i, 'event_id' => '10', 'membership_role' => 'participant', 'version' => '1:1', 'conversation_available' => false, 'message_id' => 999, 'raw_message' => 'Never expose message']; }
$source->items['activities'] = [['kind' => 'activity', 'id' => '10', 'title' => 'Synthetic current Space', 'summary' => 'Current Space summary', 'href' => '/s/synthetic/', 'event_id' => '10', 'membership_role' => 'member', 'version' => '1']];
$sharing = new InMemoryRelationSharingRepository(); $now = 1000;
$reader = new ProfileRelationService($entry, $source, $sharing, new RelationCursor(str_repeat('s', 32)), function() use (&$now) { return $now; });
$context = new RelationAccessContext(1, 2, 'event_card', '10', 10); $self = new RelationAccessContext(1, 1, 'self', '1', 10);
ok($reader->read($context, 'idea_groups')['items'] === [], 'all relations private by default');
$ownPage = $reader->read($self, 'idea_groups');
ok(count($ownPage['items']) === 24 && $ownPage['next_cursor'] !== null && $ownPage['items'][0]['visibility'] === 'private', 'owner gets private defaults with bounded pagination');
ok(!str_contains(json_encode($ownPage), 'message_id') && !str_contains(json_encode($ownPage), 'Never expose message'), 'message IDs and bodies stripped from source metadata');
for ($i = 1; $i <= 51; ++$i) { $reader->share(1, 10, 'idea_groups', (string)$i, 0, 'authenticated'); }
$first = $reader->read($context, 'idea_groups'); $second = $reader->read($context, 'idea_groups', $first['next_cursor']); $third = $reader->read($context, 'idea_groups', $second['next_cursor']);
ok(count($first['items']) === 24 && count($second['items']) === 24 && count($third['items']) === 3 && $third['next_cursor'] === null, '24/24/3 signed pages exhaust correctly');
ok(count(array_unique(array_column(array_merge($first['items'], $second['items'], $third['items']), 'id'))) === 51, 'stable relation pagination has no duplicates');
ok($first['items'][0]['conversation_available'] === false, 'non-participant viewer receives metadata only');
deny(fn() => $reader->read($context, 'idea_groups', null, 49), 422, 'max 48 enforced');
deny(fn() => $reader->read($context, 'idea_groups', $first['next_cursor'], 48), 409, 'cursor limit binding enforced');
deny(fn() => $reader->read(new RelationAccessContext(1, 3, 'event_card', '10', 10), 'idea_groups', $first['next_cursor']), 409, 'cursor viewer binding enforced');
deny(fn() => $reader->read($context, 'activities', $first['next_cursor']), 409, 'cursor relation kind binding enforced');
deny(fn() => $reader->read($context, 'idea_groups', $first['next_cursor'] . 'x'), 409, 'cursor signature forgery rejected');
$now = 1900; deny(fn() => $reader->read($context, 'idea_groups', $first['next_cursor']), 410, '900-second TTL enforced at boundary'); $now = 1000;
deny(fn() => $reader->share(1, 10, 'idea_groups', '1', 0, 'private'), 409, 'sharing stale CAS rejected');
$reader->share(1, 10, 'idea_groups', '1', 1, 'friends');
deny(fn() => $reader->read($context, 'idea_groups', $first['next_cursor']), 409, 'sharing changes invalidate prior cursor');
ok(!in_array('1', array_column($reader->read($context, 'idea_groups', null, 48)['items'], 'id'), true), 'friends relation hidden from stranger');
$relations->friendships = [[1, 2], [2, 1]];
ok(in_array('1', array_column($reader->read($context, 'idea_groups', null, 48)['items'], 'id'), true), 'real new friend dynamically gains friends relation');
$relations->friendships = [];
deny(fn() => $reader->share(1, 10, 'idea_groups', 'unknown', 0, 'authenticated'), 404, 'cannot share nonexistent relation');
deny(fn() => $reader->read(new RelationAccessContext(1, 2, 'friend', '1', 10), 'idea_groups'), 403, 'caller-constructed friend context does not grant relation access');
deny(fn() => $reader->read(new RelationAccessContext(1, 2, 'event_card', '20', 10), 'idea_groups'), 403, 'mismatched entry ID rejected');
$source->fail = true; deny(fn() => $reader->read($context, 'idea_groups'), 503, 'optional source failure explicit 503'); $source->fail = false;
$source->calls = 0; $source->hook = function(int $call) use ($source) { if ($call === 2) { array_pop($source->items['idea_groups']); } };
deny(fn() => $reader->read($context, 'idea_groups'), 409, 'object revocation rechecked before returning'); $source->hook = null;
$source->calls = 0; $source->hook = function(int $call) use ($entry) { if ($call === 1) { $entry->discoverable[1] = false; } };
deny(fn() => $reader->read($context, 'idea_groups'), 403, 'discovery optout during source read prevents output'); $source->hook = null; $entry->discoverable[1] = true;
$source->calls = 0; $source->hook = function(int $call) use ($source) { if ($call === 3) { $source->items['activities'] = []; } };
deny(fn() => $reader->share(1, 10, 'activities', '10', 0, 'authenticated'), 409, 'object revoked during sharing write rejects success'); $source->hook = null;
ok($sharing->read(1, 10, 'activities')['10'] === ['version' => 2, 'visibility' => 'private'], 'failed sharing postcheck restores private with a newer CAS version');
$source->items['idea_groups'] = array_fill(0, 2001, $source->items['idea_groups'][0]);
deny(fn() => $reader->read($context, 'idea_groups'), 503, 'over 2000 never silently truncates');
$relations->memberships[10] = [2, 3]; deny(fn() => $reader->read($self, 'activities'), 403, 'self cannot bypass actual Space membership');
echo json_encode(['status' => 'passed', 'passed' => count($checks), 'checks' => $checks, 'database_calls' => 0, 'llm_calls' => 0], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
