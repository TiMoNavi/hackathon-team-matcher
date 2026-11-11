<?php
declare(strict_types=1);
require dirname(__DIR__) . '/support/autoload.php';
use humhub\modules\matcherRecommendation\application\{BrowsePeople, ManageDiscoverySettings};
use humhub\modules\matcherRecommendation\contracts\CurrentEventContext;
use humhub\modules\matcherRecommendation\contracts\ports\{Clock, CurrentEventAccess, OrdinaryDiscoverySource, DiscoverySettingsStore};
use humhub\modules\matcherRecommendation\adapters\browse\HmacOrdinaryCursorCodec;
use humhub\modules\matcherRecommendation\domain\browse\{OrdinaryDiscoveryQuery, DiscoveryException};

final class MemoryEvents implements CurrentEventAccess
{
    public string $version = 'session-selection-1'; public int $space = 7;
    public function resolve(int $viewerId, ?int $requestedSpaceId = null): CurrentEventContext
    {
        if ($viewerId !== 1 || ($requestedSpaceId !== null && $requestedSpaceId !== $this->space)) { throw new DiscoveryException('ACCESS_DENIED', 'Wrong selected activity.', 403); }
        return new CurrentEventContext($viewerId, $this->space, $this->version, 'policy-1');
    }
    public function assertCurrent(CurrentEventContext $context): void
    { if ($this->resolve($context->viewerId, $context->spaceId)->accessVersion !== $context->accessVersion) { throw new DiscoveryException('CONTEXT_CHANGED', 'Changed.', 409); } }
}
final class MemoryPeople implements OrdinaryDiscoverySource
{
    public int $reads = 0; public ?Closure $onRead = null;
    public function __construct(public array $cards) {}
    public function readCurrent(CurrentEventContext $context): array { ++$this->reads; if ($this->onRead !== null) { ($this->onRead)($this); } return $this->cards; }
}
final class MemoryClock implements Clock
{
    public int $seconds = 1794484800;
    public function now(): DateTimeImmutable { return new DateTimeImmutable('@' . $this->seconds); }
}
final class MemorySettings implements DiscoverySettingsStore
{
    public array $rows = [];
    public function read(CurrentEventContext $context): array { return $this->rows[$context->spaceId] ?? ['space_id' => $context->spaceId, 'discoverable' => false, 'version' => 0]; }
    public function change(CurrentEventContext $context, int $expectedVersion, bool $discoverable): array
    {
        if ($this->read($context)['version'] !== $expectedVersion) { throw new DiscoveryException('DISCOVERY_VERSION_CONFLICT', 'Conflict.', 409); }
        return $this->rows[$context->spaceId] = ['space_id' => $context->spaceId, 'discoverable' => $discoverable, 'version' => $expectedVersion + 1];
    }
}
$checks = [];
function check(bool $value, string $message): void { global $checks; if (!$value) { throw new RuntimeException('FAIL: ' . $message); } $checks[] = $message; }
function rejects(callable $run, string $code): void
{ try { $run(); } catch (DiscoveryException $e) { check($e->errorCode === $code, 'rejects ' . $code); return; } check(false, 'expected ' . $code); }
function attribute(string $key, mixed $value): array { return ['key' => $key, 'value' => $value]; }
function card(int $id): array
{
    return ['owner_id' => $id, 'space_id' => 7, 'display_name' => '模拟人物' . $id, 'identity_version' => 1, 'avatar_ref' => null,
        'global' => ['attributes' => [attribute('skill', ['code' => $id === 501 ? 'rare-501' : 'php', 'label' => 'Synthetic']), attribute('role', ['code' => 'developer', 'label' => 'Developer'])]],
        'space' => ['attributes' => [attribute('event_role', ['code' => 'developer', 'label' => 'Developer'])]],
        'updated_at' => '2026-11-12T00:00:00.000000Z', 'relationship' => ['state' => $id === 2 ? 'friend' : ($id === 3 ? 'pending_out' : 'none')]];
}
$cards = []; for ($id = 2; $id <= 501; $id++) { $cards[$id] = card($id); }
$events = new MemoryEvents(); $source = new MemoryPeople($cards); $clock = new MemoryClock(); $codec = new HmacOrdinaryCursorCodec(str_repeat('test-only-key-', 4));
$service = new BrowsePeople($events, $source, $codec, $clock);
$first = $service->page(1, 7, new OrdinaryDiscoveryQuery());
check(count($first['items']) === 24 && $first['items'][0]['owner_id'] === 501 && $first['has_more'], 'default recent descending ID tie-break and 24-card page');
$ids = []; $page = $first;
do { array_push($ids, ...array_column($page['items'], 'owner_id')); $cursor = $page['next_cursor']; if ($cursor !== null) { $page = $service->page(1, 7, new OrdinaryDiscoveryQuery(cursor: $cursor)); } } while ($cursor !== null);
check(count($ids) === 500 && count(array_unique($ids)) === 500 && end($ids) === 2, 'all 500 candidates paginate once, beyond 200 recall limit');
$rare = $service->page(1, 7, new OrdinaryDiscoveryQuery(['skill' => ['rare-501']]));
check(array_column($rare['items'], 'owner_id') === [501], 'last underlying candidate survives complete-set filtering');
check($service->detail(1, 7, 2)['relationship']['state'] === 'friend' && $service->detail(1, 7, 3)['relationship']['state'] === 'pending_out', 'ordinary cards preserve friend and pending states');
check($service->page(1, 7, new OrdinaryDiscoveryQuery(['skill' => ['does-not-exist']]))['items'] === [], 'unknown code is a truthful empty result');
rejects(fn() => $service->page(1, 7, new OrdinaryDiscoveryQuery(limit: 48, cursor: $first['next_cursor'])), 'DISCOVERY_CURSOR_INVALID');
rejects(fn() => $service->page(1, 7, new OrdinaryDiscoveryQuery(['skill' => ['php']], cursor: $first['next_cursor'])), 'DISCOVERY_CURSOR_INVALID');
rejects(fn() => $service->page(1, 7, new OrdinaryDiscoveryQuery(cursor: $first['next_cursor'] . 'x')), 'DISCOVERY_CURSOR_INVALID');
$events->version = 'session-selection-2';
rejects(fn() => $service->page(1, 7, new OrdinaryDiscoveryQuery(cursor: $first['next_cursor'])), 'DISCOVERY_CURSOR_INVALID'); $events->version = 'session-selection-1';
unset($source->cards[2]);
rejects(fn() => $service->page(1, 7, new OrdinaryDiscoveryQuery(cursor: $first['next_cursor'])), 'DISCOVERY_CURSOR_INVALID');
rejects(fn() => $service->detail(1, 7, 2), 'DISCOVERY_PERSON_NOT_FOUND'); $source->cards = $cards;
$clock->seconds += 900;
rejects(fn() => $service->page(1, 7, new OrdinaryDiscoveryQuery(cursor: $first['next_cursor'])), 'DISCOVERY_CURSOR_EXPIRED'); $clock->seconds -= 900;
$source->reads = 0; $source->onRead = static function (MemoryPeople $s): void { if ($s->reads === 2) { unset($s->cards[501]); } };
rejects(fn() => $service->page(1, 7, new OrdinaryDiscoveryQuery()), 'DISCOVERY_CHANGED'); $source->onRead = null; $source->cards = $cards;
$source->cards[2]['global']['attributes'][] = attribute('skill', ['code' => 'go']);
$ranked = $service->page(1, 7, new OrdinaryDiscoveryQuery(['skill' => ['php', 'go']], 'relevance'));
check($ranked['items'][0]['owner_id'] === 2, 'relevance counts all requested public code matches');
foreach ([fn() => new OrdinaryDiscoveryQuery(['contact_email' => ['x']]), fn() => new OrdinaryDiscoveryQuery(['skill' => []]), fn() => new OrdinaryDiscoveryQuery(sort: 'id'), fn() => new OrdinaryDiscoveryQuery(limit: 49)] as $run) { rejects($run, 'INVALID_DISCOVERY_QUERY'); }
$availability = card(600);
$availability['space']['attributes'] = [attribute('event_availability', ['starts_at' => '2026-11-12T08:00:00+08:00', 'ends_at' => '2026-11-12T09:00:00+08:00']), attribute('event_availability', ['starts_at' => '2026-11-12T01:00:00Z', 'ends_at' => '2026-11-12T02:00:00Z'])];
$query = new OrdinaryDiscoveryQuery(['event_availability' => [['starts_at' => '2026-11-12T00:30:00Z', 'ends_at' => '2026-11-12T01:30:00Z']]]);
check($query->match($availability) === 0, 'adjacent intervals merge across equivalent UTC offsets');
$availability['space']['attributes'][1]['value']['starts_at'] = '2026-11-12T01:00:01Z'; check($query->match($availability) === null, 'one-second gap is not complete coverage');
rejects(fn() => new OrdinaryDiscoveryQuery(['event_availability' => [['starts_at' => '2026-02-30T00:00:00Z', 'ends_at' => '2026-03-03T00:00:00Z']]]), 'INVALID_DISCOVERY_QUERY');
$settings = new MemorySettings(); $manage = new ManageDiscoverySettings($events, $settings);
check($manage->read(1, 7) === ['space_id' => 7, 'discoverable' => false, 'version' => 0], 'membership alone never opts in');
check($manage->change(1, 7, 0, true)['version'] === 1, 'explicit opt-in increments version');
rejects(fn() => $manage->change(1, 7, 0, false), 'DISCOVERY_VERSION_CONFLICT');
$events->space = 8; check($manage->read(1, 8)['discoverable'] === false, 'a different activity starts opted out');
echo json_encode(['status' => 'passed', 'checks' => count($checks), 'passed' => $checks, 'llm_calls' => 0], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
