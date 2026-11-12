<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
use humhub\modules\matcherChat\adapters\memory\InMemoryChatStore;
use humhub\modules\matcherChat\application\{ChatReader, ChatSender};
use humhub\modules\matcherChat\domain\{AccessGrant, Attachment, AttachmentReceipt, Conversation, Message, PageRequest, Sender, SendReceipt, SendText};
use humhub\modules\matcherChat\domain\ports\SendRepository;
use humhub\modules\matcherChat\adapters\security\HmacCursorCodec;
use humhub\modules\matcherChat\adapters\memory\FrozenClock;
$id = '12345678-1234-4234-8234-123456789012';
$uploadId = '12345678-1234-4234-8234-123456789013';
$file = new Attachment($id, 10, 'synthetic.txt', 'text/plain', 4);
$store = new InMemoryChatStore(); $conversation = new Conversation(10, 'direct', null, 1);
$store->seedConversation($conversation);
$grant = new AccessGrant(1, 10, 'direct', 1, 1, 0, true, 'active', true, true, false, false, null, null, Attachment::capability(true, true));
$store->seedGrant($grant);
$writes = new class($store, $file) implements SendRepository {
    private ?SendReceipt $receipt = null;
    public function __construct(private InMemoryChatStore $store, private Attachment $file) {}
    public function receipt(int $viewerId, int $conversationId, string $clientMessageId): ?SendReceipt { return $this->receipt; }
    public function assertQuota(int $viewerId): void {}
    public function append(int $viewerId, int $conversationId, SendText $text): Message { $message = new Message(100, $conversationId, 1, $viewerId, $text->body === '' ? 'attachment' : 'text', $text->body === '' ? null : $text->body, '2026-11-13T00:00:00Z', [$this->file]); $this->store->seedMessage($message); return $message; }
    public function remember(int $viewerId, int $conversationId, SendText $text, Message $message): void { $this->receipt = new SendReceipt($message->id, $message->seq, $text->bodyHash); }
};
$sender = new ChatSender($store, $store, $writes, $store);
$command = new SendText($uploadId, '', [$id]);
$send = $sender->send(1, 10, $command, 'attachment-send');
$replay = $sender->send(1, 10, $command, 'attachment-replay');
$reader = new ChatReader($store, $store, new HmacCursorCodec(str_repeat('synthetic-only-key-', 3), new FrozenClock(1794528000)), $store);
$cases = [];
foreach ([false, true] as $replayed) { $cases[] = ['name' => $replayed ? 'upload-replay' : 'upload-new', 'kind' => 'upload', 'status' => $replayed ? 200 : 201, 'payload' => AttachmentReceipt::uploaded($file, $uploadId, $replayed, 1794614400, 'upload')]; }
foreach (['cancelled', 'expired'] as $state) { $cases[] = ['name' => 'cancel-' . $state, 'kind' => 'cancel', 'status' => 200, 'payload' => AttachmentReceipt::cancelled($id, $state, 'cancel')]; }
$cases[] = ['name' => 'attachment-send', 'kind' => 'send', 'status' => 201, 'payload' => $send];
$cases[] = ['name' => 'attachment-replay', 'kind' => 'send', 'status' => 200, 'payload' => $replay];
$cases[] = ['name' => 'attachment-history', 'kind' => 'history', 'status' => 200, 'payload' => $reader->messages(1, 10, new PageRequest(), 'attachment-history')];
$cases[] = ['name' => 'attachment-summary', 'kind' => 'conversations', 'status' => 200, 'payload' => $reader->conversations(1, new PageRequest(), 'attachment-summary')];
echo json_encode(['schema_version' => 1, 'kind' => 'matcher-chat-c05b-synthetic-contract', 'cases' => $cases], JSON_THROW_ON_ERROR), PHP_EOL;
