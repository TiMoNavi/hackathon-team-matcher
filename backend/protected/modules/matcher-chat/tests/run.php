<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/fixtures.php';

use humhub\modules\matcherChat\adapters\memory\InMemoryChatStore;
use humhub\modules\matcherChat\adapters\security\HmacCursorCodec;
use humhub\modules\matcherChat\application\ChatReader;
use humhub\modules\matcherChat\domain\{ChatException, Conversation, Message, PageRequest, SafeInteger, Sender};
use humhub\modules\matcherChat\domain\ports\ReadRepository;
use function humhub\modules\matcherChat\tests\{fixture, grant};
use const humhub\modules\matcherChat\tests\SYNTHETIC_KEY;

$checks = 0;
function same(mixed $expected, mixed $actual, string $label): void
{
    global $checks;
    $checks++;
    if ($expected !== $actual) { throw new RuntimeException($label . ': expected ' . json_encode($expected) . ', got ' . json_encode($actual)); }
}
function error(callable $operation, string $code, int $status, string $label): ChatException
{
    try { $operation(); } catch (ChatException $e) {
        same($code, $e->errorCode, $label . ' code');
        same($status, $e->httpStatus, $label . ' status');
        return $e;
    }
    throw new RuntimeException($label . ': expected a ChatException.');
}
function seqs(array $page): array { return array_column($page['data']['items'], 'seq'); }
function token(array $value): string
{
    $encode = static fn (string $s): string => rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
    $body = $encode(json_encode($value, JSON_THROW_ON_ERROR));
    return $body . '.' . $encode(hash_hmac('sha256', $body, SYNTHETIC_KEY, true));
}

same(9007199254740991, SafeInteger::native('9007199254740991', 'id'), 'native max exact');
same(0, SafeInteger::native('0', 'seq', true), 'native zero');
foreach (['9007199254740992', '999999999999999999999999', '01', '-1', '1.0', '1e3', 1.0, null, 0] as $invalid) {
    error(fn () => SafeInteger::native($invalid, 'id'), 'NATIVE_INTEGER_UNSUPPORTED', 503, 'native invalid');
}
foreach ([0, -1, '1', 1.0, true, SafeInteger::MAX + 1] as $invalid) {
    error(fn () => SafeInteger::positive($invalid, 'id'), 'INVALID_ARGUMENT', 422, 'safe positive invalid');
}
same(24, (new PageRequest())->limit, 'default limit');
same(48, (new PageRequest(48))->limit, 'max limit');
foreach ([0, 49, '24', 2.0, true] as $limit) { error(fn () => new PageRequest($limit), 'INVALID_ARGUMENT', 422, 'limit invalid'); }
error(fn () => new PageRequest(2, '', null), 'INVALID_ARGUMENT', 422, 'empty cursor');
error(fn () => new PageRequest(2, str_repeat('x', 4097)), 'INVALID_ARGUMENT', 422, 'large cursor');
error(fn () => new PageRequest(2, 'cursor', 0), 'INVALID_ARGUMENT', 422, 'cursor and after exclusive');
error(fn () => new PageRequest(2, null, -1), 'INVALID_ARGUMENT', 422, 'negative after');
error(fn () => new Conversation(1, 'legacy', null, 1), 'UNADMITTED_CONVERSATION', 503, 'legacy not inferred');
error(fn () => new Conversation(1, 'direct', null, 1, 7, 70), 'INVALID_PROJECTION', 503, 'direct no activity');
error(fn () => new Message(1, 1, 1, 1, 'text', 'body', '2026-02-30T00:00:00Z'), 'INVALID_PROJECTION', 503, 'invalid calendar date');
error(fn () => new Message(1, 1, 1, 1, 'deleted', 'hidden', '2026-11-12T00:00:00Z'), 'INVALID_PROJECTION', 503, 'tombstone no body');

[$reader, $store] = fixture();
$all = $reader->conversations(1, new PageRequest(), 'list');
same([40, 30, 20, 10], array_column($all['data']['items'], 'id'), 'stable authorized list descending id');
same(false, $all['data']['has_more'], 'list complete');
same(null, $all['data']['next_cursor'], 'list complete cursor');
same(null, $all['data']['items'][0]['last_message'], 'empty conversation has no fake message');
same(0, $all['data']['items'][0]['unread_count'], 'empty conversation unread');
same(7, $all['data']['items'][1]['space_id'], 'discussion has explicit space');
same(false, array_key_exists('space_id', $all['data']['items'][2]), 'ordinary group has no invented space');
same(12, $all['data']['items'][2]['last_message']['seq'], 'group authorized last message');
same(2, $all['data']['items'][2]['unread_count'], 'group unread from actual eligible text');
same(3, $all['data']['items'][3]['unread_count'], 'private unread excludes self system deletion and holes');
same(0, $store->readSeq(1, 10, 1), 'list never marks seen');
same(false, str_contains(json_encode($all), 'HIDDEN_'), 'list does not reveal hidden synthetic content');
$firstList = $reader->conversations(1, new PageRequest(2), 'list-first');
$secondList = $reader->conversations(1, new PageRequest(2, $firstList['data']['next_cursor']), 'list-second');
same([40, 30], array_column($firstList['data']['items'], 'id'), 'list first page');
same([20, 10], array_column($secondList['data']['items'], 'id'), 'list second page');
same(false, $secondList['data']['has_more'], 'list last page');
same([], $reader->conversations(9, new PageRequest(), 'empty-list')['data']['items'], 'empty authorized viewer');
error(fn () => $reader->conversations(1, new PageRequest(2, null, 0), 'bad-list'), 'INVALID_ARGUMENT', 422, 'list rejects increment');

$newest = $reader->messages(1, 10, new PageRequest(2), 'newest');
$older = $reader->messages(1, 10, new PageRequest(2, $newest['data']['next_cursor']), 'older');
$oldest = $reader->messages(1, 10, new PageRequest(2, $older['data']['next_cursor']), 'oldest');
same([7, 8], seqs($newest), 'latest page ascending');
same([4, 5], seqs($older), 'older page ascending');
same([1, 2], seqs($oldest), 'oldest page ascending');
same(false, $oldest['data']['has_more'], 'oldest page complete');
same(null, $oldest['data']['next_cursor'], 'oldest page no cursor');
same(1099, $newest['data']['items'][0]['id'], 'native entry id not conversation sequence');
same(['status' => 'unavailable'], $newest['data']['items'][0]['sender'], 'tombstone author unavailable');
same(['status' => 'unavailable'], $newest['data']['items'][1]['sender'], 'unavailable sender no stale profile');
same([], $newest['data']['items'][1]['attachments'], 'no attachment capability');
same(0, $store->readSeq(1, 10, 1), 'history never marks seen');
$increment = $reader->messages(1, 10, new PageRequest(2, null, 1), 'increment');
same([2, 4], seqs($increment), 'increment ascending');
same(true, $increment['data']['has_more'], 'increment bounded');
same(null, $increment['data']['next_cursor'], 'increment has no backwards cursor');
same([5, 7], seqs($reader->messages(1, 10, new PageRequest(2, null, 4), 'increment-next')), 'increment resumes from last seq');
same([], seqs($reader->messages(1, 10, new PageRequest(2, null, 8), 'increment-empty')), 'increment caught up');
$group = $reader->messages(1, 20, new PageRequest(), 'group');
same([4, 9, 12], seqs($group), 'group strict join boundary');
same(3, $group['data']['read_seq'], 'group read baseline join seq');
same(3, $group['data']['context']['history_after_seq'], 'group context baseline');
same([4, 9, 12], seqs($reader->messages(1, 20, new PageRequest(24, null, 0), 'group-increment')), 'increment cannot bypass join boundary');
$discussion = $reader->messages(1, 30, new PageRequest(), 'discussion');
same([3], seqs($discussion), 'discussion history isolated');
same(70, $discussion['data']['context']['idea_activity_id'], 'discussion exact binding');
foreach ([50, 70, 80, 999] as $id) { error(fn () => $reader->messages(1, $id, new PageRequest(), 'unavailable'), 'CONVERSATION_UNAVAILABLE', 404, 'unavailable details'); }
same([], seqs($reader->messages(1, 40, new PageRequest(), 'empty-history')), 'empty history no synthetic first message');

$initialRead = $reader->markRead(1, 10, 0, 'read-initial');
same(0, $initialRead['data']['read_seq'], 'zero read baseline');
same(3, $initialRead['data']['unread_count'], 'initial real unread');
same(4, $reader->markRead(1, 10, 4, 'read-forward')['data']['read_seq'], 'read advances');
$lower = $reader->markRead(1, 10, 2, 'read-lower');
same(4, $lower['data']['read_seq'], 'read never regresses');
same(1, $lower['data']['unread_count'], 'lower read cannot revive unread');
same(4, $reader->markRead(1, 10, 0, 'read-zero-again')['data']['read_seq'], 'zero cannot regress');
error(fn () => $reader->markRead(1, 10, 3, 'read-hole'), 'INVALID_READ_POSITION', 422, 'sequence hole is not a position');
error(fn () => $reader->markRead(1, 10, 999, 'read-future'), 'INVALID_READ_POSITION', 422, 'future read denied');
error(fn () => $reader->markRead(1, 20, 1, 'read-prejoin'), 'INVALID_READ_POSITION', 422, 'prejoin read denied');
same(3, $reader->markRead(1, 20, 3, 'read-join')['data']['read_seq'], 'join boundary no-op');
same(1, $reader->markRead(1, 20, 9, 'read-group')['data']['unread_count'], 'own read position still advances');
same(12, $reader->markRead(1, 20, 12, 'read-group-last')['data']['read_seq'], 'group latest read');
$store->seedGrant(grant(20, 'group', 3, native: false, state: 'left'));
error(fn () => $reader->markRead(1, 20, 12, 'left-read'), 'CONVERSATION_UNAVAILABLE', 404, 'left cannot read state');
$store->seedGrant(grant(20, 'group', 12, generation: 2, version: 3));
$rejoined = $reader->messages(1, 20, new PageRequest(), 'rejoined');
same([], seqs($rejoined), 'rejoin does not restore old history');
same(12, $rejoined['data']['read_seq'], 'new generation floor');
same(0, $store->readSeq(1, 20, 2), 'history does not write new generation read state');
same(12, $store->readSeq(1, 20, 1), 'prior generation independently retained');
$store->seedMessage(new Message(2013, 20, 13, 2, 'text', 'Synthetic after rejoin', '2026-11-12T00:00:00Z'));
same([13], seqs($reader->messages(1, 20, new PageRequest(), 'rejoin-new')), 'rejoin new history');
same(1, $reader->messages(1, 20, new PageRequest(), 'rejoin-unread')['data']['unread_count'], 'rejoin unread excludes all old generations');

[$reader, $store, $clock, $codec] = fixture();
$cursor = $reader->messages(1, 10, new PageRequest(2), 'cursor-source')['data']['next_cursor'];
error(fn () => $reader->messages(1, 10, new PageRequest(3, $cursor), 'different-limit'), 'CURSOR_CONTEXT_CHANGED', 409, 'cursor binds limit');
error(fn () => $reader->messages(1, 20, new PageRequest(2, $cursor), 'different-conversation'), 'CURSOR_CONTEXT_CHANGED', 409, 'cursor binds conversation');
$store->seedGrant(grant(10, viewer: 2));
error(fn () => $reader->messages(2, 10, new PageRequest(2, $cursor), 'different-viewer'), 'CURSOR_CONTEXT_CHANGED', 409, 'cursor binds viewer');
error(fn () => $reader->messages(1, 10, new PageRequest(2, $cursor . 'x'), 'tampered'), 'INVALID_CURSOR', 422, 'tamper rejected');
error(fn () => $reader->messages(1, 10, new PageRequest(2, '..'), 'malformed'), 'INVALID_CURSOR', 422, 'malformed rejected');
error(fn () => $reader->conversations(1, new PageRequest(2, $cursor), 'resource-mismatch'), 'CURSOR_CONTEXT_CHANGED', 409, 'cursor binds resource');
$clock->timestamp += 900;
error(fn () => $reader->messages(1, 10, new PageRequest(2, $cursor), 'expired'), 'CURSOR_EXPIRED', 410, 'exact TTL expiry');
$clock->timestamp -= 900;
$scope = ['resource' => 'synthetic'];
$simple = $codec->issue($scope, 1);
same(1, $codec->read($simple, $scope), 'signed cursor roundtrip');
$clock->timestamp -= 1;
error(fn () => $codec->read($simple, $scope), 'INVALID_CURSOR', 422, 'future cursor timestamp');
$clock->timestamp += 1;
foreach ([['iat' => 1700000000, 'exp' => 1700000901], ['iat' => 1700000000, 'exp' => 1700000899], ['iat' => -1, 'exp' => 899], ['iat' => 1700000001, 'exp' => 1700000901], ['iat' => '1700000000', 'exp' => 1700000900]] as $times) {
    $forged = token(['v' => 1, 'scope' => $scope, 'position' => 1, 'iat' => $times['iat'], 'exp' => $times['exp']]);
    error(fn () => $codec->read($forged, $scope), 'INVALID_CURSOR', 422, 'invalid signed timestamps');
}
[$reader, $store] = fixture();
$cursor = $reader->messages(1, 10, new PageRequest(2), 'auth-cursor')['data']['next_cursor'];
$store->seedGrant(grant(10, send: false, version: 2), false);
error(fn () => $reader->messages(1, 10, new PageRequest(2, $cursor), 'changed-auth'), 'CURSOR_CONTEXT_CHANGED', 409, 'cursor binds authorization version independent of actor revision');
$history = $reader->messages(1, 10, new PageRequest(), 'former-friend');
same(true, $history['data']['context']['permissions']['read'], 'friendship ended preserves legal history');
same(false, $history['data']['context']['permissions']['send'], 'friendship ended stops future sending');
same(0, $history['data']['context']['history_after_seq'], 'private read does not require current activity');

[$reader, $store] = fixture();
$cursor = $reader->messages(1, 20, new PageRequest(1), 'group-cursor')['data']['next_cursor'];
$store->seedGrant(grant(20, 'group', 3, generation: 2), false);
error(fn () => $reader->messages(1, 20, new PageRequest(1, $cursor), 'generation-change'), 'CURSOR_CONTEXT_CHANGED', 409, 'cursor binds member generation');
[$reader, $store] = fixture();
$cursor = $reader->messages(1, 20, new PageRequest(1), 'join-cursor')['data']['next_cursor'];
$store->seedGrant(grant(20, 'group', 4), false);
error(fn () => $reader->messages(1, 20, new PageRequest(1, $cursor), 'join-change'), 'CURSOR_CONTEXT_CHANGED', 409, 'cursor binds history floor');
[$reader, $store] = fixture();
$cursor = $reader->conversations(1, new PageRequest(2), 'list-cursor')['data']['next_cursor'];
$store->removeGrant(1, 10);
error(fn () => $reader->conversations(1, new PageRequest(2, $cursor), 'list-revoked'), 'CURSOR_CONTEXT_CHANGED', 409, 'list cursor binds actor revision');
[$reader, $store] = fixture();
$store->seedGrant(grant(30, 'discussion', 2, space: 8, idea: 70));
error(fn () => $reader->messages(1, 30, new PageRequest(), 'wrong-space'), 'CONVERSATION_UNAVAILABLE', 404, 'discussion space mismatch');
[$reader, $store] = fixture();
$store->seedGrant(grant(30, 'discussion', 2, space: 7, idea: 71));
error(fn () => $reader->messages(1, 30, new PageRequest(), 'wrong-idea'), 'CONVERSATION_UNAVAILABLE', 404, 'discussion idea binding mismatch');
[$reader, $store] = fixture();
$store->seedGrant(grant(70, 'group', native: true, state: 'invited'));
error(fn () => $reader->messages(1, 70, new PageRequest(), 'native-invited'), 'CONVERSATION_UNAVAILABLE', 404, 'native membership cannot bypass invitation acceptance');
$store->seedGrant(grant(10, read: false));
error(fn () => $reader->messages(1, 10, new PageRequest(), 'business-revoked'), 'CONVERSATION_UNAVAILABLE', 404, 'native membership insufficient without business grant');
same(0, $store->calls['messages'] ?? 0, 'denied reads never fetch bodies');

foreach (['messages', 'sender', 'unreadCount'] as $hook) {
    [$reader, $store] = fixture();
    $store->onNext($hook, fn (InMemoryChatStore $s) => $s->seedGrant(grant(10, native: false), false));
    error(fn () => $reader->messages(1, 10, new PageRequest(), 'late-revoke'), 'CONVERSATION_UNAVAILABLE', 404, 'late native revocation at ' . $hook);
}
[$reader, $store] = fixture();
$store->onNext('sender', fn (InMemoryChatStore $s) => $s->seedSender(1, 10, 2, Sender::unavailable()));
error(fn () => $reader->messages(1, 10, new PageRequest(), 'late-profile'), 'AUTHORIZATION_CHANGED', 409, 'late sender projection invalidates response');
$safeAgain = $reader->messages(1, 10, new PageRequest(), 'safe-after-profile');
same(['status' => 'unavailable'], $safeAgain['data']['items'][0]['sender'], 'fresh projection removes stale display name');
[$reader, $store] = fixture();
$beforeProjection = $reader->messages(1, 10, new PageRequest(24, null, 8), 'before-profile-change');
$beforeList = $reader->conversations(1, new PageRequest(), 'before-list-profile');
$store->seedSender(1, 10, 2, Sender::unavailable());
$afterProjection = $reader->messages(1, 10, new PageRequest(24, null, 8), 'after-profile-change');
$afterList = $reader->conversations(1, new PageRequest(), 'after-list-profile');
same([], seqs($afterProjection), 'profile revoke can occur on an empty increment');
same($beforeProjection['data']['context']['authorization_version'], $afterProjection['data']['context']['authorization_version'], 'sender visibility is distinct from conversation grant version');
same(true, $afterProjection['data']['context']['authorization_revision'] > $beforeProjection['data']['context']['authorization_revision'], 'empty increment exposes projection authority revision');
same(true, $afterList['data']['authorization_revision'] > $beforeList['data']['authorization_revision'], 'list exposes projection authority revision');
same($afterList['data']['authorization_revision'], $reader->markRead(1, 10, 0, 'read-profile-revision')['data']['context']['authorization_revision'], 'read-state carries current viewer authority revision');
[$reader, $store] = fixture();
$store->onNext('advanceReadSeq', fn (InMemoryChatStore $s) => $s->removeGrant(1, 10, false));
error(fn () => $reader->markRead(1, 10, 4, 'late-write-revoke'), 'CONVERSATION_UNAVAILABLE', 404, 'late revocation aborts write');
same(0, $store->readSeq(1, 10, 1), 'failed read update rolls back in memory');
[$reader, $store] = fixture();
$store->onNext('messages', fn (InMemoryChatStore $s) => $s->seedGrant(grant(40, native: false), false));
error(fn () => $reader->conversations(1, new PageRequest(), 'late-list-revoke'), 'CONVERSATION_UNAVAILABLE', 404, 'list final checks catch unchanged-version native revoke');
[$reader, $store] = fixture();
$longBody = str_repeat('资料', 5000);
$store->seedMessage(new Message(1200, 10, 9, 2, 'text', $longBody, '2026-11-12T00:00:00Z'));
same($longBody, $reader->messages(1, 10, new PageRequest(1), 'long-native-read')['data']['items'][0]['body'], 'old native text never truncated to future send limit');

// Deliberately bad repository proves the application rejects broken adapter ranges.
final class WrongMessages implements ReadRepository
{
    public function __construct(private ReadRepository $base, private array $rows, private ?int $storedRead = null, private ?int $mergedRead = null) {}
    public function conversation(int $id): ?Conversation { return $this->base->conversation($id); }
    public function messages(int $id, int $after, ?int $before, int $limit, bool $newest): array { return $this->rows; }
    public function messageAt(int $id, int $seq): ?Message { return $this->base->messageAt($id, $seq); }
    public function readSeq(int $viewer, int $id, int $generation): int { return $this->storedRead ?? $this->base->readSeq($viewer, $id, $generation); }
    public function advanceReadSeq(int $viewer, int $id, int $generation, int $seq): int { $saved = $this->base->advanceReadSeq($viewer, $id, $generation, $seq); return $this->mergedRead ?? $saved; }
    public function unreadCount(int $viewer, int $id, int $after): int { return $this->base->unreadCount($viewer, $id, $after); }
}
[$reader, $store, $clock, $codec] = fixture();
foreach ([
    [$store->messageAt(20, 4)],
    [$store->messageAt(10, 1), $store->messageAt(10, 4)],
    [$store->messageAt(10, 1), $store->messageAt(10, 1)],
] as $rows) {
    $bad = new ChatReader($store, new WrongMessages($store, $rows), $codec, $store);
    error(fn () => $bad->messages(1, 10, new PageRequest(), 'bad-adapter'), 'INVALID_READ_PROJECTION', 503, 'broken repository rejected');
}
$bad = new ChatReader($store, new WrongMessages($store, [$store->messageAt(20, 1)]), $codec, $store);
error(fn () => $bad->messages(1, 20, new PageRequest(), 'prejoin-adapter'), 'INVALID_READ_PROJECTION', 503, 'repository cannot return prejoin message');
foreach ([3, 9999] as $invalidPosition) {
    [$reader, $store, $clock, $codec] = fixture();
    $bad = new ChatReader($store, new WrongMessages($store, [], storedRead: $invalidPosition), $codec, $store);
    error(fn () => $bad->messages(1, 10, new PageRequest(), 'bad-stored-read'), 'INVALID_READ_PROJECTION', 503, 'stored read must point to a real message');
    error(fn () => $bad->conversations(1, new PageRequest(), 'bad-summary-read'), 'INVALID_READ_PROJECTION', 503, 'summary rejects stored read holes');
    $bad = new ChatReader($store, new WrongMessages($store, [], mergedRead: $invalidPosition), $codec, $store);
    error(fn () => $bad->markRead(1, 10, 2, 'bad-merged-read'), 'INVALID_READ_PROJECTION', 503, 'merged read must point to a real message');
    same(0, $store->readSeq(1, 10, 1), 'bad merged read rolls back actual saved target');
}
[$reader, $store, $clock, $codec] = fixture();
$validConcurrent = new ChatReader($store, new WrongMessages($store, [], mergedRead: 8), $codec, $store);
same(8, $validConcurrent->markRead(1, 10, 2, 'valid-higher-merge')['data']['read_seq'], 'higher merged read accepted only when position exists');
error(fn () => (new Message(1, 10, 1, 2, 'text', 'Synthetic text', '2026-11-12T00:00:00Z'))->summary(Sender::available(3, 'Wrong author')), 'INVALID_PROJECTION', 503, 'sender projection cannot change native author');

foreach (['Module.php', 'config.php', 'module.json', 'migrations', 'controllers'] as $forbidden) {
    same(false, file_exists(dirname(__DIR__) . '/' . $forbidden), 'not installable: ' . $forbidden);
}
echo json_encode(['status' => 'passed', 'checks' => $checks, 'scope' => 'C04-P synthetic domain/application/ports only', 'database_connections' => 0, 'http_requests' => 0, 'model_calls' => 0], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES) . PHP_EOL;
