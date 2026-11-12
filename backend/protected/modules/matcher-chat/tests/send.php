<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

use humhub\modules\matcherChat\adapters\memory\InMemoryChatStore;
use humhub\modules\matcherChat\application\ChatSender;
use humhub\modules\matcherChat\domain\{AccessGrant, ChatException, Conversation, Message, SendText};

$checks = 0;
function sendCheck(bool $condition, string $label): void { global $checks; ++$checks; if (!$condition) { throw new RuntimeException($label); } }
function sendError(callable $operation, string $code): ChatException
{
    try { $operation(); } catch (ChatException $error) { sendCheck($error->errorCode === $code, $code); return $error; }
    throw new RuntimeException('Expected error missing.');
}
function sendKey(int $n): string { return '12345678-1234-4234-8234-' . sprintf('%012d', $n); }
function sendStore(): InMemoryChatStore
{
    $store = new InMemoryChatStore();
    foreach ([10, 11] as $conversation) {
        $store->seedConversation(new Conversation($conversation, 'direct', null, 1));
        foreach ([1, 2] as $actor) { $store->seedGrant(new AccessGrant($actor, $conversation, 'direct', 1, 1, 0, true, 'active', true, true)); }
    }
    return $store;
}
function sendService(InMemoryChatStore $store): ChatSender { return new ChatSender($store, $store, $store, $store); }

$key = sendKey(1);
foreach (['x', '  x  ', "\tline\r\nnext\n", '<script>alert(1)</script>&lt;x&gt;', '中文🙂é', str_repeat('🙂', 4000), str_repeat('中', 4000), '@user [x](file://none) **literal**'] as $body) {
    $input = new SendText($key, $body);
    sendCheck($input->body === $body && $input->bodyHash === hash('sha256', $body), 'body exact preservation');
}
foreach (['', ' ', "\t\r\n", "\u{00a0}\u{3000}", "x\0", "x\u{0085}", "x\u{007f}", "\xff", str_repeat('🙂', 4001), 1, null, []] as $body) {
    sendError(fn () => new SendText($key, $body), 'INVALID_MESSAGE_BODY');
}
foreach (['12345678-1234-1234-8234-123456789012', 'ABCDEF00-1234-4234-8234-123456789012', '12345678-1234-4234-7234-123456789012', '', [], null, $key . ' '] as $badKey) {
    sendError(fn () => new SendText($badKey, 'text'), 'INVALID_CLIENT_MESSAGE_ID');
}
$store = sendStore(); $sender = sendService($store);
$input = new SendText($key, 'Synthetic exact <tag> & text');
$first = $sender->send(1, 10, $input, 'send-first');
sendCheck(array_keys($first['data']) === ['message', 'client_message_id', 'replayed', 'read_seq', 'unread_count', 'context'], 'send DTO exact fields');
sendCheck(!$first['data']['replayed'] && $first['data']['message']['seq'] === 1 && $first['data']['message']['body'] === $input->body, 'new message receipt');
sendCheck($first['data']['read_seq'] === 0 && $first['data']['unread_count'] === 0, 'sending does not mark own history read');
sendCheck($store->unreadCount(2, 10, 0) === 1, 'recipient gets one unread message');
$replay = $sender->send(1, 10, $input, 'send-replay');
sendCheck($replay['data']['replayed'] && $replay['data']['message'] === $first['data']['message'], 'same key/body returns same message');
sendCheck(($store->calls['append'] ?? 0) === 1 && ($store->calls['assertQuota'] ?? 0) === 1, 'legal replay does not append or use quota');
sendError(fn () => $sender->send(1, 10, new SendText($key, 'different'), 'conflict'), 'IDEMPOTENCY_CONFLICT');
sendCheck(count($store->messages(10, 0, null, 49, false)) === 1, 'conflict preserves message count');
sendCheck(!$sender->send(1, 11, $input, 'other-conversation')['data']['replayed'], 'same UUID in different conversation is independent');
sendCheck(!$sender->send(2, 10, $input, 'other-actor')['data']['replayed'], 'same UUID from other actor is independent');
sendCheck($store->readSeq(1, 10, 1) === 0 && $store->readSeq(2, 10, 1) === 0, 'both read states preserved');
$store->seedGrant(new AccessGrant(1, 10, 'direct', 1, 1, 0, true, 'active', true, false));
sendError(fn () => $sender->send(1, 10, $input, 'replay-after-unfriend'), 'SEND_FORBIDDEN');
$store->removeGrant(1, 10);
sendError(fn () => $sender->send(1, 10, $input, 'replay-after-revoke'), 'CONVERSATION_UNAVAILABLE');
sendError(fn () => $sender->send(3, 10, $input, 'outsider'), 'CONVERSATION_UNAVAILABLE');

foreach (['append', 'remember', 'unreadCount', 'sender'] as $stage) {
    $store = sendStore(); $sender = sendService($store);
    $store->onNext($stage, static function (): void { throw new RuntimeException('Synthetic failure.'); });
    try { $sender->send(1, 10, $input, 'rollback'); throw new LogicException('Failure expected.'); }
    catch (RuntimeException $error) { sendCheck($error->getMessage() === 'Synthetic failure.', 'failure surfaced'); }
    sendCheck($store->messages(10, 0, null, 49, false) === [] && $store->receipt(1, 10, $key) === null, 'entry/seq/receipt rollback together');
    sendCheck(!$sender->send(1, 10, $input, 'retry-after-rollback')['data']['replayed'], 'same key works after rollback');
}
$store = sendStore(); $sender = sendService($store);
$store->onNext('remember', static fn (InMemoryChatStore $s) => $s->removeGrant(1, 10));
sendError(fn () => $sender->send(1, 10, $input, 'revoke-during-send'), 'CONVERSATION_UNAVAILABLE');
sendCheck($store->messages(10, 0, null, 49, false) === [] && $store->receipt(1, 10, $key) === null, 'late authorization loss rolls back all send data');
$store = sendStore(); $sender = sendService($store);
$original = $sender->send(1, 10, $input, 'original-before-edit')['data']['message'];
$property = new ReflectionProperty(InMemoryChatStore::class, 'messages');
$messages = $property->getValue($store);
$messages[10][1] = new Message($original['id'], 10, 1, 1, 'text', 'Synthetic subsequently edited text', $original['created_at']);
$property->setValue($store, $messages);
$edited = $sender->send(1, 10, $input, 'replay-current-edit')['data'];
sendCheck($edited['replayed'] && $edited['message']['id'] === $original['id'] && $edited['message']['body'] === 'Synthetic subsequently edited text', 'replay returns current authorized edited projection');
$messages[10][1] = new Message($original['id'], 10, 1, null, 'deleted', null, $original['created_at']);
$property->setValue($store, $messages);
$deleted = $sender->send(1, 10, $input, 'replay-current-delete')['data'];
sendCheck($deleted['replayed'] && $deleted['message']['kind'] === 'deleted' && $deleted['message']['body'] === null
    && $deleted['message']['sender'] === ['status' => 'unavailable'], 'replay never resurrects original deleted body or sender');
sendCheck(($store->calls['append'] ?? 0) === 1 && ($store->calls['assertQuota'] ?? 0) === 1, 'edited/deleted replay remains side-effect free');
$store = sendStore(); $sender = sendService($store);
for ($i = 1; $i <= 60; ++$i) { $sender->send(1, $i % 2 === 0 ? 10 : 11, new SendText(sendKey($i), 'Synthetic quota ' . $i), 'quota-' . $i); }
$limited = sendError(fn () => $sender->send(1, 10, new SendText(sendKey(61), 'over limit'), 'quota-over'), 'RATE_LIMITED');
sendCheck($limited->httpStatus === 429 && $limited->retryAfterSeconds === 60 && $limited->details === [], 'quota has safe explicit retry delay');
sendCheck($sender->send(1, 11, new SendText(sendKey(1), 'Synthetic quota 1'), 'quota-replay')['data']['replayed'], 'replay allowed while quota full');
sendError(fn () => $sender->send(1, 11, new SendText(sendKey(1), 'changed'), 'quota-conflict'), 'IDEMPOTENCY_CONFLICT');
sendCheck(!$sender->send(2, 10, new SendText(sendKey(61), 'other sender'), 'other-sender-quota')['data']['replayed'], 'quota isolated per sender');
$store->now += 59;
sendCheck(sendError(fn () => $sender->send(1, 10, new SendText(sendKey(61), 'over limit'), 'quota-59'), 'RATE_LIMITED')->retryAfterSeconds === 1, 'rolling quota boundary');
$store->now += 1;
sendCheck(!$sender->send(1, 10, new SendText(sendKey(61), 'allowed'), 'quota-60')['data']['replayed'], 'quota window expires without deleting permanent keys');
sendCheck($sender->send(1, 11, new SendText(sendKey(1), 'Synthetic quota 1'), 'permanent-replay')['data']['replayed'], 'idempotency survives quota expiry');
echo json_encode(['status' => 'passed', 'checks' => $checks, 'database_connections' => 0, 'http_requests' => 0,
    'scope' => 'synthetic send use case, idempotency, quota and rollback; not SQL/HTTP acceptance'], JSON_THROW_ON_ERROR), PHP_EOL;
