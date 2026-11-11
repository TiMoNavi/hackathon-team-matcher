<?php
declare(strict_types=1);
require __DIR__ . '/support/autoload.php';
use humhub\modules\matcherRecommendation\application\BrowsePeople;
use humhub\modules\matcherRecommendation\contracts\CurrentEventContext;
use humhub\modules\matcherRecommendation\contracts\ports\{CurrentEventAccess, OrdinaryDiscoverySource, Clock};
use humhub\modules\matcherRecommendation\domain\browse\{DiscoveryException, OrdinaryDiscoveryQuery};
use humhub\modules\matcherRecommendation\adapters\browse\HmacOrdinaryCursorCodec;

$checks = [];
function verify(bool $ok, string $name): void { global $checks; if (!$ok) { throw new RuntimeException('FAIL: ' . $name); } $checks[] = $name; }
function reject(callable $action, string $reason, string $name): void
{
    try { $action(); } catch (Throwable $e) { verify($e->getMessage() === $reason || ($e instanceof DiscoveryException && $e->errorCode === $reason), $name); return; }
    verify(false, $name);
}
final class S7AuditBrowseAccess implements CurrentEventAccess
{
    public bool $allowed = true; public CurrentEventContext $context;
    public function __construct() { $this->context = new CurrentEventContext(41, 7, 'audit-access-v1', 'audit-policy-v1'); }
    public function resolve(int $viewerId, ?int $requestedSpaceId = null): CurrentEventContext
    {
        if (!$this->allowed || $viewerId !== $this->context->viewerId || ($requestedSpaceId !== null && $requestedSpaceId !== $this->context->spaceId)) { throw new RuntimeException('audit_access_denied'); }
        return $this->context;
    }
    public function assertCurrent(CurrentEventContext $context): void { if (!$this->allowed || $context !== $this->context) { throw new RuntimeException('audit_context_changed'); } }
}
final class S7AuditBrowseSource implements OrdinaryDiscoverySource
{
    public array $people = []; public int $reads = 0; public ?Closure $onRead = null;
    public function readCurrent(CurrentEventContext $context): array { $this->reads++; if ($this->onRead) { ($this->onRead)($this->reads); } return $this->people; }
}
final class S7AuditBrowseClock implements Clock
{
    public DateTimeImmutable $time;
    public function __construct() { $this->time = new DateTimeImmutable('2026-11-12T00:00:00Z'); }
    public function now(): DateTimeImmutable { return $this->time; }
}
function card(int $id, array $global = [], array $space = []): array { return ['owner_id' => $id, 'updated_at' => '2026-11-12T00:00:00Z', 'global' => ['attributes' => $global], 'space' => ['attributes' => $space]]; }
function attribute(string $key, mixed $value): array { return ['key' => $key, 'value' => $value]; }

$card = card(101, [attribute('skill', ['code' => 'rust']), attribute('skill', ['code' => 'php']), attribute('role', ['code' => 'backend'])], [
    attribute('event_seeking', ['role_codes' => ['designer'], 'skill_codes' => ['figma']]),
    attribute('event_availability', ['starts_at' => '2026-11-12T09:00:00+08:00', 'ends_at' => '2026-11-12T10:00:00+08:00']),
    attribute('event_availability', ['starts_at' => '2026-11-12T02:00:00Z', 'ends_at' => '2026-11-12T03:00:00Z']),
]);
verify((new OrdinaryDiscoveryQuery(['skill' => ['rust', 'php'], 'role' => ['backend']]))->match($card) === 3, 'matching public code count supports multiple values');
verify((new OrdinaryDiscoveryQuery(['skill' => ['rust'], 'role' => ['designer']]))->match($card) === null, 'different filter fields use AND');
verify((new OrdinaryDiscoveryQuery(['skill' => ['absent', 'rust']]))->match($card) === 1, 'same field filter values use OR');
verify((new OrdinaryDiscoveryQuery(['event_seeking' => ['role_codes' => ['designer'], 'skill_codes' => ['figma']]]))->match($card) === 2, 'seeking role and skill groups each match');
verify((new OrdinaryDiscoveryQuery(['event_seeking' => ['role_codes' => ['designer'], 'skill_codes' => ['go']]]))->match($card) === null, 'missing seeking group prevents match');
verify((new OrdinaryDiscoveryQuery(['skill' => [' RUST ', 'rust', 'PHP']]))->filters === ['skill' => ['php', 'rust']], 'case whitespace ordering and duplicates canonicalize');
$window = ['starts_at' => '2026-11-12T01:00:00Z', 'ends_at' => '2026-11-12T03:00:00Z'];
verify((new OrdinaryDiscoveryQuery(['event_availability' => [$window]]))->match($card) === 0, 'adjacent intervals completely cover a UTC normalized window');
$outside = $window; $outside['ends_at'] = '2026-11-12T03:00:01Z';
verify((new OrdinaryDiscoveryQuery(['event_availability' => [$outside]]))->match($card) === null, 'overlap alone cannot satisfy a complete requested window');
$gapCard = $card; $gapCard['space']['attributes'][2]['value']['starts_at'] = '2026-11-12T02:00:01Z';
verify((new OrdinaryDiscoveryQuery(['event_availability' => [$window]]))->match($gapCard) === null, 'one-second gap prevents full availability coverage');
verify((new OrdinaryDiscoveryQuery(['event_availability' => [$window, ['starts_at' => '2026-11-13T01:00:00Z', 'ends_at' => '2026-11-13T02:00:00Z']]]))->match($card) === null, 'every requested window needs full coverage');
foreach ([
    fn() => new OrdinaryDiscoveryQuery(['unknown' => ['x']]), fn() => new OrdinaryDiscoveryQuery(['skill' => []]),
    fn() => new OrdinaryDiscoveryQuery(['skill' => 'rust']), fn() => new OrdinaryDiscoveryQuery(['skill' => [true]]),
    fn() => new OrdinaryDiscoveryQuery(['skill' => ['']]), fn() => new OrdinaryDiscoveryQuery(['skill' => ["bad\ncode"]]),
    fn() => new OrdinaryDiscoveryQuery(['event_seeking' => ['free_text' => 'x']]),
    fn() => new OrdinaryDiscoveryQuery(['event_availability' => [['starts_at' => '2026-02-30T01:00:00Z', 'ends_at' => '2026-03-01T02:00:00Z']]]),
    fn() => new OrdinaryDiscoveryQuery(['event_availability' => [['starts_at' => '2026-11-12 01:00:00', 'ends_at' => '2026-11-12T02:00:00Z']]]),
    fn() => new OrdinaryDiscoveryQuery(['event_availability' => [['starts_at' => '2026-11-12T02:00:00Z', 'ends_at' => '2026-11-12T01:00:00Z']]]),
    fn() => new OrdinaryDiscoveryQuery([], 'id'), fn() => new OrdinaryDiscoveryQuery([], 'recent', 0),
    fn() => new OrdinaryDiscoveryQuery([], 'recent', 49), fn() => new OrdinaryDiscoveryQuery([], 'recent', 24, ''),
    fn() => new OrdinaryDiscoveryQuery([], 'recent', 24, null, 'idea'),
] as $i => $bad) { reject($bad, 'INVALID_DISCOVERY_QUERY', 'invalid structured query rejected #' . ($i + 1)); }

$access = new S7AuditBrowseAccess(); $source = new S7AuditBrowseSource(); $clock = new S7AuditBrowseClock();
$codec = new HmacOrdinaryCursorCodec(str_repeat('s7-audit-fixture-key-', 4));
for ($i = 2; $i <= 101; $i++) { $source->people[$i] = card($i, [attribute('skill', ['code' => $i === 101 ? 'rare-last-person' : 'ordinary'])]); }
$browse = new BrowsePeople($access, $source, $codec, $clock); $first = $browse->page(41, 7, new OrdinaryDiscoveryQuery());
verify(count($first['items']) === 24 && $first['has_more'] && !$first['exhausted'] && $first['limit'] === 24, 'default page is 24 with continuation');
verify($first['items'][0]['owner_id'] === 101 && $first['items'][23]['owner_id'] === 78, 'recent ties use descending numeric ID');
$seen = array_column($first['items'], 'owner_id'); $cursor = $first['next_cursor']; $pages = 1;
while ($cursor !== null) { $page = $browse->page(41, 7, new OrdinaryDiscoveryQuery(cursor: $cursor)); $seen = array_merge($seen, array_column($page['items'], 'owner_id')); $cursor = $page['next_cursor']; $pages++; }
verify($pages === 5 && $seen === range(101, 2), 'all 100 synthetic port cards paginate exactly once');
verify(!$page['has_more'] && $page['exhausted'] && count($page['items']) === 4, 'last page reports true exhaustion without padding');
verify(count($browse->page(41, 7, new OrdinaryDiscoveryQuery(limit: 48))['items']) === 48, 'maximum page size is 48');
$rare = $browse->page(41, 7, new OrdinaryDiscoveryQuery(['skill' => ['rare-last-person']]));
verify(array_column($rare['items'], 'owner_id') === [101], 'last source person is filtered before slicing');
$empty = $browse->page(41, 7, new OrdinaryDiscoveryQuery(['skill' => ['does-not-exist']]));
verify($empty['items'] === [] && $empty['next_cursor'] === null && !$empty['has_more'], 'unmatched code returns true empty result');
verify($browse->detail(41, 7, 101)['owner_id'] === 101, 'detail resolves current authorized source card');
reject(fn() => $browse->detail(41, 7, 999), 'DISCOVERY_PERSON_NOT_FOUND', 'unknown detail does not fabricate a card');
$token = $first['next_cursor']; $decoded = $codec->decode($token);
verify($decoded['expires_at'] - $decoded['created_at'] === 900, 'cursor validity is exactly fifteen minutes');
reject(fn() => $browse->page(41, 7, new OrdinaryDiscoveryQuery(['skill' => ['ordinary']], cursor: $token)), 'DISCOVERY_CURSOR_INVALID', 'cursor cannot change filters');
reject(fn() => $browse->page(41, 7, new OrdinaryDiscoveryQuery(sort: 'relevance', cursor: $token)), 'DISCOVERY_CURSOR_INVALID', 'cursor cannot change sort');
reject(fn() => $browse->page(41, 7, new OrdinaryDiscoveryQuery(limit: 48, cursor: $token)), 'DISCOVERY_CURSOR_INVALID', 'cursor cannot change page size');
$tampered = $token; $tampered[6] = $tampered[6] === 'A' ? 'B' : 'A';
reject(fn() => $codec->decode($tampered), 'DISCOVERY_CURSOR_INVALID', 'payload tampering fails HMAC verification');
reject(fn() => (new HmacOrdinaryCursorCodec(str_repeat('different-fixture-key-', 3)))->decode($token), 'DISCOVERY_CURSOR_INVALID', 'another signing key cannot validate cursor');
$clock->time = $clock->time->modify('+900 seconds');
reject(fn() => $browse->page(41, 7, new OrdinaryDiscoveryQuery(cursor: $token)), 'DISCOVERY_CURSOR_EXPIRED', 'cursor expires exactly on fifteen-minute boundary');
$clock->time = $clock->time->modify('-900 seconds');
$access->context = new CurrentEventContext(42, 7, 'audit-access-v1', 'audit-policy-v1');
reject(fn() => $browse->page(42, 7, new OrdinaryDiscoveryQuery(cursor: $token)), 'DISCOVERY_CURSOR_INVALID', 'cursor cannot cross viewer identities');
$access->context = new CurrentEventContext(41, 7, 'audit-access-v2', 'audit-policy-v1');
reject(fn() => $browse->page(41, 7, new OrdinaryDiscoveryQuery(cursor: $token)), 'DISCOVERY_CURSOR_INVALID', 'new selection revision invalidates previous cursor');
$access->context = new CurrentEventContext(41, 8, 'audit-access-v1', 'audit-policy-v1');
reject(fn() => $browse->page(41, 8, new OrdinaryDiscoveryQuery(cursor: $token)), 'DISCOVERY_CURSOR_INVALID', 'cursor cannot cross Spaces');
$access->context = new CurrentEventContext(41, 7, 'audit-access-v1', 'audit-policy-v1'); unset($source->people[101]);
reject(fn() => $browse->page(41, 7, new OrdinaryDiscoveryQuery(cursor: $token)), 'DISCOVERY_CURSOR_INVALID', 'authorization snapshot change invalidates old page');
reject(fn() => $browse->detail(41, 7, 101), 'DISCOVERY_PERSON_NOT_FOUND', 'removed authorization denies detail');
$source->reads = 0; $source->onRead = static function (int $reads) use ($source): void { if ($reads === 2) { unset($source->people[100]); } };
reject(fn() => $browse->page(41, 7, new OrdinaryDiscoveryQuery()), 'DISCOVERY_CHANGED', 'page denies changed source during read');
$source->reads = 0; $source->onRead = static function (int $reads) use ($source): void { if ($reads === 2) { unset($source->people[99]); } };
reject(fn() => $browse->detail(41, 7, 99), 'DISCOVERY_PERSON_NOT_FOUND', 'detail rechecks removal during read');
$source->onRead = null; $source->people = []; $access->allowed = false;
reject(fn() => $browse->page(41, 7, new OrdinaryDiscoveryQuery()), 'audit_access_denied', 'empty set cannot hide denied viewer access');
$access->allowed = true; $source->onRead = static function (): void { throw new RuntimeException('audit_source_unavailable'); };
reject(fn() => $browse->page(41, 7, new OrdinaryDiscoveryQuery()), 'audit_source_unavailable', 'dependency failure cannot become empty success');
echo json_encode(['status' => 'passed', 'scope' => 'Independent memory-port filters, paging, HMAC and reauthorization; no SQL, HTTP or installed seed validation claimed.', 'checks' => count($checks), 'checks_passed' => $checks, 'network_calls' => 0, 'model_calls' => 0], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
