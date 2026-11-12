<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';
$backend = dirname(__DIR__, 4);
require $backend . '/protected/vendor/autoload.php';
require $backend . '/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub', $backend . '/protected/humhub');

use humhub\modules\matcherChat\adapters\http\{ActorExpectation, RequestBoundary};
use humhub\modules\matcherChat\adapters\native\{NativeGuard, NativeProjection};
use humhub\modules\matcherChat\adapters\persistence\SqlState;
use humhub\modules\matcherChat\domain\ChatException;

$checks = 0;
function check(bool $condition, string $message): void { global $checks; $checks++; if (!$condition) { throw new RuntimeException($message); } }
function denied(callable $operation, string $label, int $status = 404): void
{
    try { $operation(); } catch (\yii\web\HttpException $e) { check($e->statusCode === $status, $label); return; }
    throw new RuntimeException($label . ' was not denied');
}
function domainError(callable $operation, string $code, string $label): void
{
    try { $operation(); } catch (ChatException $e) { check($e->errorCode === $code, $label); return; }
    throw new RuntimeException($label . ' did not fail');
}

// Read-only SQL seam for the guard, not a database/transaction test.
final class GuardSqlConnection extends \yii\db\Connection
{
    public int $lookups = 0;
    public function createCommand($sql = null, $params = [])
    {
        return new class($this, $sql, $params) {
            public function __construct(private GuardSqlConnection $db, private string $sql, private array $params) {}
            public function queryOne($mode = null): array|false
            {
                $this->db->lookups++;
                $sql = $this->sql; $p = $this->params;
                if (str_contains($sql, 'FROM {{%file}}')) {
                    return ($p[':guid'] ?? null) === 'synthetic-managed-file' ? ['object_model' => 'humhub\\modules\\mail\\models\\MessageEntry', 'object_id' => 1001] : false;
                }
                if (str_contains($sql, 'FROM {{%matcher_chat_member}}')) { return in_array($p[':id'] ?? null, [1, 2], true) ? ['message_id' => 10] : false; }
                if (str_contains($sql, 'INNER JOIN {{%user_message}}')) { return ($p[':id'] ?? null) === 3 ? ['message_id' => 10] : false; }
                if (str_contains($sql, 'INNER JOIN {{%message_entry}}') || str_contains($sql, 'FROM {{%matcher_chat_entry_sequence}}')) { return ($p[':id'] ?? null) === 1001 ? ['message_id' => 10] : false; }
                if (str_contains($sql, 'FROM {{%matcher_chat_conversation}}')) { return !isset($p[':id']) || $p[':id'] === 10 ? ['message_id' => 10] : false; }
                throw new RuntimeException('Unexpected guard SQL seam');
            }
        };
    }
}
$connection = new GuardSqlConnection();
$guard = new NativeGuard(new SqlState($connection));
check($guard->managed(10), 'managed native id');
check(!$guard->managed(99), 'unmanaged native id');
check($guard->viewerManaged(1), 'historical admitted viewer');
check($guard->viewerManaged(3), 'unexpected native member still guarded');
check(!$guard->viewerManaged(9), 'unrelated viewer remains unrelated');
foreach (['mail/mail/show', 'mail/mail/update', 'mail/mail/load-more', 'mail/mail/reply', 'mail/mail/edit-title', 'mail/mail/leave'] as $route) {
    denied(fn () => $guard->request($route, ['id' => '10'], [], 9), 'managed object guarded: ' . $route);
    $guard->request($route, ['id' => '99'], [], 9); check(true, 'unmanaged web object preserved');
}
foreach (['mail/mail/notification-list', 'mail/inbox/index', 'mail/inbox/update-entries', 'mail/mail/get-new-message-count-json', 'mail/mail/show', 'mail/mail/edit-title'] as $route) {
    foreach ([[], ['id' => '99'], ['id' => ['99']]] as $input) { denied(fn () => $guard->request($route, $input, [], 1), 'mixed native aggregate cannot use harmless id'); }
}
foreach (['00010', '+10', '10 ', '1e1', ['10'], 0, true, '9007199254740992'] as $id) {
    denied(fn () => $guard->request('mail/mail/show', ['id' => $id], [], 9), 'noncanonical mysql integer lookup denied');
}
denied(fn () => $guard->request('mail/mail/edit-entry', ['id' => '1001'], [], 9), 'entry-id route protected');
denied(fn () => $guard->request('mail/mail/seen', [], ['id' => '10'], 9), 'POST id protected');
denied(fn () => $guard->request('mail/rest/message/index', [], [], null), 'REST aggregate cannot depend on pre-auth session');
denied(fn () => $guard->request('mail/rest/entry/view', ['messageId' => '99'], [], null), 'REST isolation guard independent of actor');
denied(fn () => $guard->request('meta-search/index', [], ['provider' => 'humhub\\modules\\mail\\search\\SearchProvider'], 1), 'meta-search mail projection denied');
foreach (['humhub\\modules\\mail\\search\\searchprovider', 'HuMhUb\\MoDuLeS\\MaIl\\SeArCh\\SeArChPrOvIdEr', '\\humhub\\modules\\mail\\search\\SearchProvider', '\\\\HUMHUB\\MODULES\\MAIL\\SEARCH\\SEARCHPROVIDER'] as $provider) {
    denied(fn () => $guard->request('meta-search/index', [], ['provider' => $provider], 1), 'case-insensitive native mail provider denied');
    denied(fn () => $guard->request('meta-search/index', ['provider' => 'humhub\\modules\\space\\search\\SpaceSearchProvider'], ['provider' => $provider], 1), 'query provider cannot mask native POST mail provider');
}
foreach ([[], ['provider' => null], ['provider' => []], ['provider' => ['class' => 'humhub\\modules\\mail\\search\\SearchProvider']], ['provider' => true], ['provider' => ''], ['provider' => '\\\\']] as $body) {
    denied(fn () => $guard->request('meta-search/index', ['provider' => 'humhub\\modules\\space\\search\\SpaceSearchProvider'], $body, 1), 'missing or malformed POST provider cannot fall back to query');
}
$guard->request('meta-search/index', [], ['provider' => 'humhub\\modules\\space\\search\\SpaceSearchProvider'], 1); check(true, 'other search provider unchanged');
$guard->request('meta-search/index', ['provider' => 'humhub\\modules\\mail\\search\\SearchProvider'], ['provider' => 'humhub\\modules\\space\\search\\SpaceSearchProvider'], 1); check(true, 'native POST provider remains authoritative');
$guard->request('meta-search/index', [], ['provider' => 'humhub\\modules\\mail\\search\\searchprovider'], 9); check(true, 'unrelated viewer native search unchanged');
denied(fn () => $guard->request('live/poll/index', [], [], 1), 'unprotected native poll remains denied');
$guard->request('live/poll/index', [], [], 1, true); check(true, 'filtered poll admits non-chat event processing');
$guard->request('live/poll/index', [], [], 9); check(true, 'unrelated native poll unchanged');
$guard->request('live/legitimation/index', [], [], 1); check(true, 'unrelated live route no longer globally denied');
$guard->request('dashboard/dashboard', ['guid' => 'synthetic-managed-file'], [], 1); check(true, 'arbitrary non-file guid is not a chat route');
foreach (['file/file/download', 'file/view/index'] as $route) {
    denied(fn () => $guard->request($route, ['guid' => 'synthetic-managed-file', 'token' => 'synthetic-token', 'variant' => 'preview'], [], null), 'token does not bypass managed file guard');
    foreach ([['synthetic-managed-file'], 'synthetic-managed-file ', str_repeat('x', 65), null] as $guid) { denied(fn () => $guard->request($route, ['guid' => $guid], [], null), 'file guid has strict shape'); }
}
denied(fn () => $guard->fileAssociationManaged('humhub\\modules\\mail\\models\\MessageEntry', '0001001'), 'file association rejects coercive ids');
check($guard->fileAssociationManaged('\\HuMhUb\\MoDuLeS\\MaIl\\MoDeLs\\MeSsAgEeNtRy', 1001), 'file model class spelling cannot bypass managed association');
check(!$guard->fileAssociationManaged('humhub\\modules\\content\\models\\Content', 1001), 'unrelated file association unchanged');

ActorExpectation::assert(null, 1); check(true, 'actor header optional for older caller');
ActorExpectation::assert('1', 1); check(true, 'actor header confirms session');
foreach (['2', '01', '+1', '1 ', '0', '1e0', 1, ['1'], '9007199254740992', ''] as $value) { domainError(fn () => ActorExpectation::assert($value, 1), 'SESSION_CHANGED', 'invalid/mismatched actor is not authenticated'); }

check(NativeProjection::pair([2, 1]) === [1, 2], 'explicit pair canonical order');
domainError(fn () => NativeProjection::pair([1, 1]), 'INVALID_DIRECT_PAIR', 'same user is not direct pair');
domainError(fn () => NativeProjection::pair([1, 2, 3]), 'INVALID_DIRECT_PAIR', 'group is not inferred as direct');
check(NativeProjection::utc('2026-11-12 08:00:00', 'Asia/Shanghai') === '2026-11-12T00:00:00Z', 'native storage timezone explicit');
domainError(fn () => NativeProjection::utc('2026-02-30 00:00:00', 'UTC'), 'INVALID_NATIVE_TIMESTAMP', 'invalid native date rejected');
check(NativeProjection::text('<p>Hello<br>World &amp; peers</p>') === "Hello\nWorld & peers\n", 'native markup projects plain text');
check(NativeProjection::text('<script>hidden()</script>Readable') === 'Readable', 'script body not projected');
check(NativeProjection::text(str_repeat('资料', 5000)) === str_repeat('资料', 5000), 'history never truncated to send limit');
domainError(fn () => NativeProjection::text('<img src="private">'), 'UNSUPPORTED_NATIVE_MESSAGE', 'image-only not falsely projected as supported');
domainError(fn () => NativeProjection::reference('secret\nvalue'), 'INVALID_ADMISSION_REFERENCE', 'admission evidence nonsecret reference syntax');

$serverMethod = $_SERVER['REQUEST_METHOD'] ?? null;
$_SERVER['REQUEST_METHOD'] = 'PUT';
$request = new \yii\web\Request(['enableCookieValidation' => false]);
$request->setPathInfo('api/v1/conversations/10/read-state');
$request->setQueryParams([]);
$request->setRawBody('{invalid-json');
$request->headers->set('Content-Type', 'application/json');
RequestBoundary::prepare($request);
check($request->bodyParams === [], 'scoped JSON is not consumed as a native form');
check($request->rawBody === '{invalid-json', 'raw JSON retained for explicit controller validation');
check($request->enableCsrfValidation === true, 'request boundary does not disable CSRF');
if ($serverMethod === null) { unset($_SERVER['REQUEST_METHOD']); } else { $_SERVER['REQUEST_METHOD'] = $serverMethod; }

echo json_encode(['status' => 'passed', 'checks' => $checks, 'sql_guard_lookups' => $connection->lookups, 'database_connections' => 0, 'http_requests' => 0, 'scope' => 'pure native projection/request/guard seams; not SQL or HTTP acceptance'], JSON_THROW_ON_ERROR) . PHP_EOL;
