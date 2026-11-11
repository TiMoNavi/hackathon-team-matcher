<?php
declare(strict_types=1);
$modules = dirname(__DIR__, 2);
spl_autoload_register(static function (string $class) use ($modules): void { foreach (['matcherProfile' => 'matcher-user-profile', 'matcherPrivacy' => 'matcher-profile-privacy', 'matcherIdeas' => 'matcher-ideas'] as $ns => $directory) { $prefix = 'humhub\\modules\\' . $ns . '\\'; if (str_starts_with($class, $prefix)) { $path = $modules . '/' . $directory . '/' . str_replace(chr(92), '/', substr($class, strlen($prefix))) . '.php'; if (is_file($path)) { require $path; } } } });
use humhub\modules\matcherPrivacy\application\ProfileRelationService;
use humhub\modules\matcherPrivacy\domain\ports\{CurrentProfileEntry, RelationCandidateSource};
use humhub\modules\matcherPrivacy\domain\RelationCursor;
use humhub\modules\matcherPrivacy\adapters\memory\InMemoryRelationSharingRepository;
use humhub\modules\matcherProfile\domain\{ProfileException, RelationAccessContext};
use humhub\modules\matcherIdeas\application\{IdeaService, IdeaDraftService, IdeaRelationSource};
use humhub\modules\matcherIdeas\adapters\memory\{InMemoryIdeaRepository, InMemoryNativeRelations, InMemoryCurrentSpaceAccess};
use humhub\modules\matcherIdeas\domain\IdeaException;
$checks = [];
function acheck(bool $ok, string $name): void { global $checks; if (!$ok) { throw new RuntimeException('FAIL: ' . $name); } $checks[] = $name; }
function areject(callable $fn, int $status, string $name): void { try { $fn(); } catch (ProfileException|IdeaException $e) { acheck($e->httpStatus === $status, $name . ' HTTP ' . $e->httpStatus); return; } acheck(false, $name); }
final class S72AuditEntry implements CurrentProfileEntry { public bool $allowed = true; public array $facts = ['version' => 'v1', 'friend' => false]; public function resolve(int $viewerId, int $ownerId, int $spaceId): array { if (!$this->allowed) { throw new ProfileException('PROFILE_ACCESS_DENIED', 'Synthetic denied', 403); } return $this->facts; } }
final class S72AuditSource implements RelationCandidateSource { public array $items = []; public int $reads = 0; public ?Closure $onRead = null; public function readCandidates(int $viewerId, int $ownerId, int $spaceId, string $kind): array { $this->reads++; if ($this->onRead) { ($this->onRead)($this->reads); } return $this->items; } }
$entry = new S72AuditEntry(); $source = new S72AuditSource(); $sharing = new InMemoryRelationSharingRepository(); $clock = 1700000000; $codec = new RelationCursor(str_repeat('s72-independent-fixture-', 3));
$service = new ProfileRelationService($entry, $source, $sharing, $codec, static function () use (&$clock): int { return $clock; });
$context = new RelationAccessContext(2, 1, 'event_card', '7', 7); $self = new RelationAccessContext(2, 2, 'self', '2', 7);
for ($n = 1; $n <= 51; $n++) { $id = (string)$n; $source->items[] = ['kind' => 'idea_group', 'id' => $id, 'title' => 'Synthetic formal idea ' . $id, 'summary' => 'Synthetic formal summary', 'href' => '/api/v1/ideas/' . $id . '?idea_activity_id=' . $id, 'event_id' => '7', 'membership_role' => 'participant', 'idea_id' => $id, 'version' => '1:1', 'conversation_available' => false, 'message_id' => 900 + $n, 'message_body' => 'Synthetic private message sentinel']; }
acheck($service->read($context, 'idea_groups')['items'] === [], 'every uninitialized per-object relation defaults private');
$owned = $service->read($self, 'idea_groups'); acheck(count($owned['items']) === 24 && $owned['items'][0]['visibility'] === 'private' && $owned['items'][0]['sharing_version'] === 0, 'self sees private choices with version zero and default page 24');
acheck(!str_contains(json_encode($owned), 'message_id') && !str_contains(json_encode($owned), 'message_body') && !str_contains(json_encode($owned), 'private message sentinel'), 'source output is cleaned to formal metadata whitelist');
foreach ($source->items as $item) { $service->share(2, 7, 'idea_groups', $item['id'], 0, 'authenticated'); }
areject(fn() => $service->share(2, 7, 'idea_groups', '1', 0, 'private'), 409, 'stale object sharing version rejected');
areject(fn() => $service->share(2, 7, 'idea_groups', 'missing', 0, 'authenticated'), 404, 'unavailable object cannot be opted in');
areject(fn() => $service->share(2, 7, 'idea_groups', '1', 1, 'public'), 422, 'unsupported sharing visibility rejected');
$first = $service->read($context, 'idea_groups'); $token = $first['next_cursor']; $seen = array_column($first['items'], 'id'); $cursor = $token; $pages = 1;
while ($cursor !== null) { $p = $service->read($context, 'idea_groups', $cursor); $seen = [...$seen, ...array_column($p['items'], 'id')]; $cursor = $p['next_cursor']; $pages++; }
acheck(count($seen) === 51 && count(array_unique($seen)) === 51 && $pages === 3, '51 authorized relations paginate exactly once over three pages');
acheck(count($p['items']) === 3 && !$p['has_more'], 'final page reports true three-item remainder');
acheck(count($service->read($context, 'idea_groups', null, 48)['items']) === 48, 'maximal relation page size 48 accepted');
foreach ([0,49] as $limit) { areject(fn() => $service->read($context, 'idea_groups', null, $limit), 422, 'out of bounds page rejected ' . $limit); }
areject(fn() => $service->read($context, 'unknown'), 422, 'unknown relation kind rejected');
areject(fn() => $service->read($context, 'idea_groups', $token, 12), 409, 'cursor binds page size');
areject(fn() => $service->read(new RelationAccessContext(2, 3, 'event_card', '7', 7), 'idea_groups', $token), 409, 'cursor binds authenticated viewer');
areject(fn() => $service->read(new RelationAccessContext(3, 1, 'event_card', '7', 7), 'idea_groups', $token), 409, 'cursor binds profile owner');
areject(fn() => $service->read(new RelationAccessContext(2, 1, 'friend', '2', 7), 'idea_groups'), 403, 'friend context alone cannot create cross-activity relation browse');
$bad = $token; $bad[2] = $bad[2] === 'A' ? 'B' : 'A'; areject(fn() => $service->read($context, 'idea_groups', $bad), 409, 'tampered signature rejected');
$clock += 900; areject(fn() => $service->read($context, 'idea_groups', $token), 410, 'relation cursor expires at exact fifteen-minute boundary'); $clock -= 900;
$service->share(2, 7, 'idea_groups', '1', 1, 'friends');
acheck(!in_array('1', array_column($service->read($context, 'idea_groups')['items'], 'id'), true), 'friends sharing is absent for nonfriend');
areject(fn() => $service->read($context, 'idea_groups', $token), 409, 'sharing revocation invalidates old cursor');
$entry->facts['friend'] = true; acheck(in_array('1', array_column($service->read($context, 'idea_groups')['items'], 'id'), true), 'new actual friendship dynamically permits friends sharing');
$first = $service->read($context, 'idea_groups'); $source->items[0]['version'] = '1:2'; areject(fn() => $service->read($context, 'idea_groups', $first['next_cursor']), 409, 'object metadata version revokes old cursor');
$source->reads = 0; $source->onRead = static function (int $reads) use ($source): void { if ($reads === 2) { array_pop($source->items); } }; areject(fn() => $service->read($context, 'idea_groups'), 409, 'mid-read object revocation cannot return mixed relation snapshot'); $source->onRead = null;
$source->items = []; $entry->allowed = false; areject(fn() => $service->read($context, 'idea_groups'), 403, 'empty result cannot conceal denied viewer access'); $entry->allowed = true;
$source->onRead = static function (): void { throw new RuntimeException('Synthetic source failure'); }; areject(fn() => $service->read($context, 'idea_groups'), 503, 'source failure is explicit rather than empty success');

$repo = new InMemoryIdeaRepository(); $native = new InMemoryNativeRelations(); $spaces = new InMemoryCurrentSpaceAccess(); $native->activeUsers = [1,2,3,4]; $native->memberships = [7 => [1,2,3], 8 => [1,2,4]]; $spaces->selected = [1 => 7,2 => 7,3 => 7,4 => 8];
$ideas = new IdeaService($repo, $native, $spaces); $drafts = new IdeaDraftService($repo, $native); $relations = new IdeaRelationSource($repo, $native, $spaces);
$draft = $drafts->start(1, null, ['title' => 'Synthetic formal title', 'summary' => 'Synthetic formal summary'], 'Synthetic private draft sentinel');
areject(fn() => $drafts->read(2, $draft['id']), 404, 'another user cannot read private idea draft');
$confirmed = $drafts->confirm(1, $draft['id'], $draft['version']); $ideaId = $confirmed['idea_id'];
areject(fn() => $drafts->confirm(1, $draft['id'], $draft['version']), 409, 'confirmed draft cannot be replayed');
areject(fn() => $ideas->associateSpace(2, $ideaId, 1, 7), 404, 'only idea owner may publish into an activity');
$activity = $ideas->associateSpace(1, $ideaId, 1, 7); acheck($activity['members_visible'] === false, 'new activity keeps author member visibility false');
acheck($relations->readCandidates(3, 2, 7) === [], 'unbound idea never becomes a participant relation');
$detail = $relations->detail(3, $ideaId, $activity['id'], 7); acheck($detail['title'] === 'Synthetic formal title' && !$detail['conversation_available'], 'same Space nonparticipant may read formal idea metadata without chat access');
acheck(!str_contains(json_encode($detail), 'private draft') && !array_key_exists('message_id', $detail), 'formal metadata excludes private source and raw message identifier');
$native->conversations[70] = ['id' => 70, 'creator_id' => 1, 'participant_ids' => [1,2], 'title' => 'Wrong chat title', 'entries' => 'Synthetic private chat sentinel'];
$activity = $ideas->bindConversation(1, $activity['id'], $activity['version'], 70);
acheck($relations->readCandidates(3, 2, 7) === [], 'binding alone does not override author hidden members');
$activity = $ideas->setMemberVisibility(1, $activity['id'], $activity['version'], true);
$items = $relations->readCandidates(3, 2, 7); acheck(count($items) === 1 && $items[0]['title'] === 'Synthetic formal title' && $items[0]['summary'] === 'Synthetic formal summary', 'explicit business relation reads formal title and summary');
acheck(!$items[0]['conversation_available'] && $items[0]['membership_role'] === 'participant', 'nonparticipant sees participant metadata without obtaining chat capability');
acheck($relations->readCandidates(2, 1, 7)[0]['conversation_available'], 'actual native participant has conversation_available true');
acheck(!str_contains(json_encode($items), 'Wrong chat') && !str_contains(json_encode($items), 'private chat') && !str_contains(json_encode($items), 'message_id'), 'message titles bodies and identifiers never appear in relation source');
$otherIdea = $ideas->create(1, 'Second synthetic idea', 'Second formal summary'); $otherActivity = $ideas->associateSpace(1, $otherIdea['id'], 1, 7);
areject(fn() => $ideas->bindConversation(1, $otherActivity['id'], 1, 70), 409, 'one native conversation cannot bind a second idea activity');
$spaces->selected[1] = 8; $otherSpace = $ideas->associateSpace(1, $ideaId, 1, 8); areject(fn() => $ideas->bindConversation(1, $otherSpace['id'], 1, 70), 409, 'existing native binding cannot cross into a second Space'); $spaces->selected[1] = 7;
$native->conversations[71] = ['id' => 71, 'creator_id' => 1, 'participant_ids' => [1,4]]; areject(fn() => $ideas->bindConversation(1, $otherActivity['id'], 1, 71), 403, 'cross-Space conversation participant blocks initial binding');
$native->conversations[72] = ['id' => 72, 'creator_id' => 2, 'participant_ids' => [1,2]]; areject(fn() => $ideas->bindConversation(1, $otherActivity['id'], 1, 72), 403, 'idea owner cannot bind somebody else native conversation');
$native->conversations[70]['participant_ids'][] = 4; acheck($relations->readCandidates(3, 2, 7) === [], 'adding nonmember revokes existing relation at read time'); unset($native->conversations[70]['participant_ids'][2]);
$native->conversations[70]['participant_ids'] = [2]; acheck($relations->readCandidates(3, 2, 7) === [], 'creator leaving conversation revokes relation immediately'); $native->conversations[70]['participant_ids'] = [1,2];
$native->blocked = [[1,2]]; acheck($relations->readCandidates(3, 2, 7) === [], 'creator participant block revokes bound conversation source'); $native->blocked = [[3,1]]; acheck($relations->readCandidates(3, 2, 7) === [], 'viewer author block removes source metadata'); $native->blocked = [[3,2]]; areject(fn() => $relations->readCandidates(3, 2, 7), 403, 'viewer profile-owner block denies source'); $native->blocked = [];
$activity = $ideas->updatePublication(1, $activity['id'], $activity['version'], null, 'archived'); acheck($relations->readCandidates(3, 2, 7) === [], 'archiving object revokes its relation'); areject(fn() => $relations->detail(3, $ideaId, $activity['id'], 7), 404, 'archived formal detail is unavailable');
echo json_encode(['status' => 'passed', 'checks' => count($checks), 'checks_passed' => $checks, 'database_calls' => 0, 'network_calls' => 0, 'model_calls' => 0], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
