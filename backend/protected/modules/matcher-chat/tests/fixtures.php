<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\tests;

use humhub\modules\matcherChat\adapters\memory\{FrozenClock, InMemoryChatStore};
use humhub\modules\matcherChat\adapters\security\HmacCursorCodec;
use humhub\modules\matcherChat\application\ChatReader;
use humhub\modules\matcherChat\domain\{AccessGrant, Conversation, Message, Sender};

const SYNTHETIC_KEY = 'synthetic-only-chat-c04p-test-key-32-bytes';

function grant(int $conversationId, string $type = 'direct', int $join = 0, int $generation = 1, int $version = 1, bool $native = true, string $state = 'active', bool $read = true, bool $send = true, int $viewer = 1, ?int $space = null, ?int $idea = null): AccessGrant
{
    return new AccessGrant($viewer, $conversationId, $type, $version, $generation, $join, $native, $state, $read, $send, $type !== 'direct', $type !== 'direct', $space, $idea);
}

/** Every value is fictional. This function does not load HumHub or any configuration. */
function fixture(): array
{
    $store = new InMemoryChatStore();
    $clock = new FrozenClock(1700000000);
    $codec = new HmacCursorCodec(SYNTHETIC_KEY, $clock);
    $reader = new ChatReader($store, $store, $codec, $store);
    $store->seedConversation(new Conversation(10, 'direct', null, 1));
    $store->seedConversation(new Conversation(20, 'group', 'Synthetic group', 1));
    $store->seedConversation(new Conversation(30, 'discussion', 'Synthetic discussion', 1, 7, 70));
    $store->seedConversation(new Conversation(40, 'direct', null, 1));
    $store->seedConversation(new Conversation(50, 'direct', 'Not authorized', 1));
    $store->seedConversation(new Conversation(70, 'group', 'Invitation only', 1));
    $store->seedConversation(new Conversation(80, 'group', 'Former group', 1));
    $store->seedGrant(grant(10));
    $store->seedGrant(grant(20, 'group', 3));
    $store->seedGrant(grant(30, 'discussion', 2, space: 7, idea: 70));
    $store->seedGrant(grant(40));
    $store->seedGrant(grant(70, 'group', native: false, state: 'invited'));
    $store->seedGrant(grant(80, 'group', native: false, state: 'left'));
    $date = '2026-11-12T00:00:00Z';
    foreach ([
        [1001, 10, 1, 2, 'text', 'Synthetic first message'],
        [1009, 10, 2, 1, 'text', 'Synthetic own message'],
        [1014, 10, 4, 2, 'text', 'Synthetic fourth position'],
        [1015, 10, 5, null, 'system', 'Synthetic system event'],
        [1099, 10, 7, 2, 'deleted', null],
        [1100, 10, 8, 3, 'text', 'Synthetic sender unavailable'],
        [2001, 20, 1, 2, 'text', 'HIDDEN_PREJOIN_SYNTHETIC'],
        [2003, 20, 3, null, 'system', 'Synthetic join boundary'],
        [2004, 20, 4, 2, 'text', 'Synthetic group message'],
        [2009, 20, 9, 1, 'text', 'Synthetic own group message'],
        [2012, 20, 12, 2, 'text', 'Synthetic newest group message'],
        [3001, 30, 1, 2, 'text', 'HIDDEN_DISCUSSION_SYNTHETIC'],
        [3003, 30, 3, 2, 'text', 'Synthetic discussion message'],
        [5001, 50, 1, 2, 'text', 'HIDDEN_UNAUTHORIZED_SYNTHETIC'],
    ] as $args) { $store->seedMessage(new Message(...[...$args, $date])); }
    foreach ([10, 20, 30, 40] as $conversation) {
        $store->seedSender(1, $conversation, 1, Sender::available(1, 'Synthetic Viewer'));
        $store->seedSender(1, $conversation, 2, Sender::available(2, 'Synthetic Peer', 'opaque-avatar-reference'));
    }
    return [$reader, $store, $clock, $codec];
}
