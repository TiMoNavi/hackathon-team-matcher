<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/fixtures.php';

use humhub\modules\matcherChat\domain\{ChatException, PageRequest, SafeInteger, Sender};
use function humhub\modules\matcherChat\tests\fixture;

$cases = [];
function capture(string $name, string $kind, callable $operation): void
{
    global $cases;
    try { $cases[] = ['name' => $name, 'kind' => $kind, 'status' => 200, 'payload' => $operation()]; }
    catch (ChatException $e) { $cases[] = ['name' => $name, 'kind' => 'error', 'status' => $e->httpStatus, 'payload' => $e->envelope($name)]; }
}

[$reader, $store, $clock] = fixture();
capture('empty-list', 'conversations', fn () => $reader->conversations(9, new PageRequest(), 'empty-list'));
capture('authorized-list', 'conversations', fn () => $reader->conversations(1, new PageRequest(), 'authorized-list'));
$list = $reader->conversations(1, new PageRequest(2), 'list-first');
capture('list-first', 'conversations', fn () => $list);
capture('list-older', 'conversations', fn () => $reader->conversations(1, new PageRequest(2, $list['data']['next_cursor']), 'list-older'));
$latest = $reader->messages(1, 10, new PageRequest(2), 'history-latest');
capture('history-latest', 'history', fn () => $latest);
capture('history-older', 'history', fn () => $reader->messages(1, 10, new PageRequest(2, $latest['data']['next_cursor']), 'history-older'));
capture('history-empty', 'history', fn () => $reader->messages(1, 40, new PageRequest(), 'history-empty'));
capture('group-history', 'history', fn () => $reader->messages(1, 20, new PageRequest(), 'group-history'));
capture('discussion-history', 'history', fn () => $reader->messages(1, 30, new PageRequest(), 'discussion-history'));
capture('increment-truncated', 'increment', fn () => $reader->messages(1, 10, new PageRequest(2, null, 1), 'increment-truncated'));
capture('increment-empty', 'increment', fn () => $reader->messages(1, 10, new PageRequest(2, null, 8), 'increment-empty'));
capture('read-initial', 'read-state', fn () => $reader->markRead(1, 10, 0, 'read-initial'));
capture('read-forward', 'read-state', fn () => $reader->markRead(1, 10, 4, 'read-forward'));
capture('read-lower', 'read-state', fn () => $reader->markRead(1, 10, 2, 'read-lower'));
capture('read-group-baseline', 'read-state', fn () => $reader->markRead(1, 20, 0, 'read-group-baseline'));
capture('increment-before-profile-change', 'increment', fn () => $reader->messages(1, 10, new PageRequest(2, null, 8), 'increment-before-profile-change'));
$store->seedSender(1, 10, 2, Sender::unavailable());
capture('increment-after-profile-change', 'increment', fn () => $reader->messages(1, 10, new PageRequest(2, null, 8), 'increment-after-profile-change'));
capture('list-after-profile-change', 'conversations', fn () => $reader->conversations(1, new PageRequest(), 'list-after-profile-change'));
capture('read-after-profile-change', 'read-state', fn () => $reader->markRead(1, 10, 4, 'read-after-profile-change'));
capture('read-hole-error', 'error', fn () => $reader->markRead(1, 10, 3, 'read-hole-error'));
capture('missing-error', 'error', fn () => $reader->messages(1, 999, new PageRequest(), 'missing-error'));
capture('cursor-limit-error', 'error', fn () => $reader->messages(1, 10, new PageRequest(3, $latest['data']['next_cursor']), 'cursor-limit-error'));
$clock->timestamp += 900;
capture('cursor-expired-error', 'error', fn () => $reader->messages(1, 10, new PageRequest(2, $latest['data']['next_cursor']), 'cursor-expired-error'));
$store->removeGrant(1, 10);
capture('revoked-error', 'error', fn () => $reader->messages(1, 10, new PageRequest(), 'revoked-error'));
capture('native-overflow-error', 'error', fn () => SafeInteger::native('9007199254740992', 'message_id'));
[$projectionReader, $projectionStore] = fixture();
capture('projection-before-list', 'conversations', fn () => $projectionReader->conversations(1, new PageRequest(), 'projection-before-list'));
capture('projection-before-history', 'history', fn () => $projectionReader->messages(1, 10, new PageRequest(), 'projection-before-history'));
$projectionStore->seedSender(1, 10, 2, Sender::unavailable());
capture('projection-after-increment', 'increment', fn () => $projectionReader->messages(1, 10, new PageRequest(24, null, 8), 'projection-after-increment'));
capture('projection-after-list', 'conversations', fn () => $projectionReader->conversations(1, new PageRequest(), 'projection-after-list'));
echo json_encode(['schema_version' => 1, 'kind' => 'matcher-chat-c04p-synthetic-contract', 'cases' => $cases], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL;
