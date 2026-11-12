<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
use humhub\modules\matcherChat\application\ChatAttachments;
use humhub\modules\matcherChat\domain\{Attachment, AttachmentUpload, AttachmentLifecycle, AttachmentReceipt, ChatException, Message, SendText, Sender};
use humhub\modules\matcherChat\domain\ports\AttachmentRepository;
$checks = 0;
function acheck(bool $ok, string $label): void { global $checks; ++$checks; if (!$ok) { throw new RuntimeException($label); } }
function aerror(callable $run, string $code, ?int $status = null): ChatException { try { $run(); } catch (ChatException $e) { acheck($e->errorCode === $code && ($status === null || $e->httpStatus === $status), $code); return $e; } throw new RuntimeException('Expected ' . $code); }
function akey(int $n): string { return '12345678-1234-4234-8234-' . sprintf('%012d', $n); }
$id = akey(1); $other = akey(2); $bytes = "Synthetic text\r\n中文🙂\t";
$input = new AttachmentUpload($id, '合成资料.txt', $bytes);
acheck($input->mime === 'text/plain' && $input->size === strlen($bytes) && $input->sha256 === hash('sha256', $bytes), 'server typed UTF-8 exact bytes');
foreach (['', '../a.txt', 'dir/a.txt', 'dir\\a.txt', "a\0.txt", "a\n.txt", "x\u{202e}.txt", '.', '..', "\u{3000}", str_repeat('a', 181), "bad\xff.txt"] as $name) { aerror(fn () => new AttachmentUpload($id, $name, 'safe'), 'INVALID_ATTACHMENT_NAME'); }
foreach ([['a.txt', ''], ['a.txt', str_repeat('x', Attachment::MAX_BYTES + 1)], ['a.txt', "x\0"], ['a.txt', "x\x85"], ['a.svg', '<svg/>'], ['a.exe', 'MZ'], ['a.pdf', 'not PDF'], ['a.png', 'not PNG'], ['a.jpg', 'not JPEG'], ['a.pdf', "%PDF-1.7\nno-end"]] as [$name, $data]) { aerror(fn () => new AttachmentUpload($id, $name, $data), $data === '' ? 'INVALID_ATTACHMENT_UPLOAD' : (strlen($data) > Attachment::MAX_BYTES ? 'ATTACHMENT_TOO_LARGE' : 'ATTACHMENT_TYPE_UNSUPPORTED')); }
acheck((new AttachmentUpload($id, 'limit.txt', str_repeat('x', Attachment::MAX_BYTES)))->size === Attachment::MAX_BYTES, '5 MiB inclusive');
$png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/fL0AAAAASUVORK5CYII=');
acheck((new AttachmentUpload($id, 'pixel.png', $png))->mime === 'image/png', 'PNG byte detection');
aerror(fn () => new AttachmentUpload($id, 'pixel.jpg', $png), 'ATTACHMENT_TYPE_UNSUPPORTED', 415);
aerror(fn () => new AttachmentUpload($id, 'pixel.png', $png . '<script>'), 'ATTACHMENT_TYPE_UNSUPPORTED', 415);
acheck((new AttachmentUpload($id, 'paper.pdf', "%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n"))->mime === 'application/pdf', 'PDF signature and EOF');
acheck($input->payloadHash !== (new AttachmentUpload($id, '另一个.txt', $bytes))->payloadHash, 'filename in upload identity');
acheck($input->payloadHash !== (new AttachmentUpload($id, '合成资料.txt', 'changed'))->payloadHash, 'bytes in upload identity');
foreach ([null, 1, [], 'ABCDEF00-1234-4234-8234-123456789012', '12345678-1234-1234-8234-123456789012'] as $bad) { aerror(fn () => Attachment::uuid($bad), 'INVALID_ATTACHMENT_ID'); }
$file = new Attachment($id, 10, 'synthetic.txt', 'text/plain', 4);
acheck(array_keys($file->dto()) === ['id', 'name', 'mime', 'size', 'download_path'] && $file->dto()['download_path'] === '/api/v1/conversations/10/attachments/' . $id . '/download', 'safe exact DTO');
acheck((new SendText($id, 'body'))->bodyHash === hash('sha256', 'body'), 'legacy hash preserved');
$pure = new SendText($id, '', [$id]); acheck($pure->body === '' && $pure->attachmentIds === [$id], 'explicit pure attachment command');
acheck($pure->bodyHash !== (new SendText($id, '', [$other]))->bodyHash, 'ids in send identity');
acheck((new SendText($id, 'body', [$id, $other]))->bodyHash !== (new SendText($id, 'body', [$other, $id]))->bodyHash, 'order in send identity');
foreach ([null, 1, [$id, $id], [$id, $other, akey(3), akey(4)], ['bad'], ['x' => $id]] as $bad) { aerror(fn () => new SendText($id, '', $bad), 'INVALID_ATTACHMENT_IDS'); }
aerror(fn () => new SendText($id, '', []), 'INVALID_MESSAGE_BODY'); aerror(fn () => new SendText($id, ' ', [$id]), 'INVALID_MESSAGE_BODY');
$message = new Message(1, 10, 1, 2, 'attachment', null, '2026-11-13T00:00:00Z', [$file]);
acheck($message->dto(Sender::unavailable())['attachments'] === [$file->dto()] && $message->body === null, 'pure attachment DTO');
acheck((new Message(2, 10, 2, 2, 'text', 'caption', '2026-11-13T00:00:00Z', [$file]))->kind === 'text', 'caption stays text');
foreach ([['attachment', null, []], ['deleted', null, [$file]], ['system', 'join', [$file]], ['attachment', '', [$file]], ['text', 'body', [$file, $file]], ['text', 'body', [new Attachment($other, 11, 'a.txt', 'text/plain', 1)]]] as [$kind, $body, $files]) { aerror(fn () => new Message(1, 10, 1, 2, $kind, $body, '2026-11-13T00:00:00Z', $files), 'INVALID_PROJECTION', 503); }
$row = ['state' => 'staged', 'expires_at' => 1000, 'payload_hash' => str_repeat('a', 64)];
AttachmentLifecycle::replay($row, str_repeat('a', 64), 999); acheck(true, 'valid replay');
aerror(fn () => AttachmentLifecycle::replay($row, str_repeat('b', 64), 999), 'IDEMPOTENCY_CONFLICT', 409);
aerror(fn () => AttachmentLifecycle::replay($row, str_repeat('a', 64), 1000), 'ATTACHMENT_UNAVAILABLE', 410);
foreach (['cancelled', 'expired', 'failed'] as $state) { $terminal = array_replace($row, ['state' => $state]); aerror(fn () => AttachmentLifecycle::replay($terminal, str_repeat('a', 64), 999), 'ATTACHMENT_UNAVAILABLE', 410); aerror(fn () => AttachmentLifecycle::bindable($terminal, 999), 'ATTACHMENT_UNAVAILABLE', 410); }
$bound = array_replace($row, ['state' => 'bound']); AttachmentLifecycle::replay($bound, str_repeat('a', 64), 1001); acheck(true, 'bound receipt outlives staging TTL');
aerror(fn () => AttachmentLifecycle::cancelledState($bound, 999), 'ATTACHMENT_ALREADY_BOUND', 409); aerror(fn () => AttachmentLifecycle::bindable($bound, 999), 'ATTACHMENT_ALREADY_BOUND', 409);
acheck(AttachmentLifecycle::cancelledState($row, 999) === 'cancelled' && AttachmentLifecycle::cancelledState($row, 1000) === 'expired', 'cancel exact expiry');
acheck(AttachmentLifecycle::cancelledState(array_replace($row, ['state' => 'cancelled']), 1001) === 'cancelled', 'cancel tombstone stable');
AttachmentLifecycle::bindable($row, 999); acheck(true, 'bind before expiry'); aerror(fn () => AttachmentLifecycle::bindable($row, 1000), 'ATTACHMENT_UNAVAILABLE', 410);
AttachmentLifecycle::quota(array_fill(0, 19, 950), array_fill(0, 19, 1100), 1000, true); acheck(true, '19 permits reservation');
acheck(aerror(fn () => AttachmentLifecycle::quota(array_fill(0, 20, 950), [], 1000, true), 'RATE_LIMITED', 429)->retryAfterSeconds === 10, 'rate retry');
acheck(aerror(fn () => AttachmentLifecycle::quota([], array_fill(0, 20, 1100), 1000, true), 'RATE_LIMITED', 429)->retryAfterSeconds === 100, 'staging retry');
AttachmentLifecycle::quota([], array_fill(0, 20, 1100), 1000, false); acheck(true, 'completion uses existing slot');
$port = new class implements AttachmentRepository {
    public array $calls = [];
    public function upload(int $conversationId, AttachmentUpload $upload, string $sourceReference, string $requestId): array { $this->calls[] = ['upload', $conversationId, $sourceReference]; return AttachmentReceipt::uploaded(new Attachment(akey(9), $conversationId, $upload->name, $upload->mime, $upload->size), $upload->clientUploadId, false, 1794614400, $requestId); }
    public function cancel(int $conversationId, string $attachmentId, string $requestId): array { $this->calls[] = ['cancel', $conversationId]; return AttachmentReceipt::cancelled($attachmentId, 'cancelled', $requestId); }
    public function download(int $conversationId, string $attachmentId): array { $this->calls[] = ['download', $conversationId]; return ['attachment' => new Attachment($attachmentId, $conversationId, 'a.txt', 'text/plain', 4), 'bytes' => 'safe']; }
    public function cleanup(int $limit = 100): array { $this->calls[] = ['cleanup', $limit]; return ['selected' => 1, 'cleaned' => 1, 'pending' => 0]; }
};
$service = new ChatAttachments($port);
acheck($service->upload(10, $input, 'opaque-source', 'upload')['data']['attachment']['mime'] === 'text/plain', 'memory upload port');
acheck($service->cancel(10, $id, 'cancel')['data']['state'] === 'cancelled', 'memory cancel port');
acheck($service->download(10, $id)['bytes'] === 'safe', 'memory download port');
acheck($service->cleanup(10)['cleaned'] === 1 && count($port->calls) === 4, 'memory cleanup port');
aerror(fn () => $service->cancel(10, 'bad', 'invalid'), 'INVALID_ATTACHMENT_ID'); acheck(count($port->calls) === 4, 'invalid UUID never reaches port');
echo json_encode(['status' => 'passed', 'checks' => $checks, 'database_connections' => 0, 'http_requests' => 0, 'scope' => 'pure validation, DTO, send identity, lifecycle, quota and application memory port'], JSON_THROW_ON_ERROR), PHP_EOL;
