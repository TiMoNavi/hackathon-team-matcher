<?php
declare(strict_types=1);
ob_start(); require __DIR__ . '/native.php'; $native = json_decode(trim(ob_get_clean()), true, 8, JSON_THROW_ON_ERROR);
$checks = 0;

use humhub\modules\matcherChat\adapters\native\{NativeProjection, NativeSendEligibility};
use humhub\modules\matcherChat\adapters\persistence\{SqlReadStore, SqlSendStore, SqlState};
use humhub\modules\matcherChat\domain\{ChatException, SendText};
use humhub\modules\matcherChat\adapters\http\RequestBoundary;

/** Executable SQL seam: no DB connection or application, never runtime credentials. */
final class SendFactConnection extends \yii\db\Connection
{
    public array $calls = [];
    public array $missing = [];
    public string $engine = 'InnoDB';
    public bool $activeTransaction = true;
    public array $settings = ['friendship' => [['value' => '1']], 'matcher-chat' => [['value' => '1']]];
    public array $users = [['id' => '1', 'status' => '1', 'contentcontainer_id' => '101'], ['id' => '2', 'status' => '1', 'contentcontainer_id' => '102']];
    public array $blocks = [];
    public array $friends = [1 => [['id' => '11', 'user_id' => '1', 'friend_user_id' => '2', 'created_at' => '2026-11-12 12:00:00']], 2 => [['id' => '12', 'user_id' => '2', 'friend_user_id' => '1', 'created_at' => '2026-11-12 12:00:00']]];
    public array $receiptRows = [];
    public array $quotaRows = [];
    public int $serverNow = 1000;
    public function getDriverName() { return 'mysql'; }
    public function getSchema()
    {
        return new class(['db' => $this]) extends \yii\db\Schema {
            protected function loadTableSchema($name) { return $this->getTableSchema($name); }
            public function getTableSchema($name, $refresh = false)
            {
                $name = trim($name, '{}%');
                if (in_array($name, $this->db->missing, true)) { return null; }
                $table = new \yii\db\TableSchema(); $table->name = $name;
                $table->primaryKey = match ($name) {
                    'contentcontainer_blocked_users' => ['contentcontainer_id', 'user_id'],
                    'matcher_chat_send_receipt' => ['message_id', 'user_id', 'client_message_id'], default => ['id'],
                };
                return $table;
            }
        };
    }
    public function getTransaction()
    {
        return new class(['db' => $this]) extends \yii\db\Transaction {
            public function getIsActive() { return $this->db->activeTransaction; }
        };
    }
    public function createCommand($sql = null, $params = [])
    {
        $this->calls[] = [$sql, $params];
        return new class($this, $sql, $params) {
            public function __construct(private SendFactConnection $db, private string $sql, private array $params) {}
            public function queryOne($mode = null)
            {
                if (str_contains($this->sql, 'information_schema.TABLES')) { return ['ENGINE' => $this->db->engine]; }
                if (str_contains($this->sql, 'UNIX_TIMESTAMP')) { return ['now' => (string)$this->db->serverNow]; }
                if (str_contains($this->sql, 'client_message_id')) { return $this->db->receiptRows[0] ?? false; }
                throw new LogicException('Unexpected send SQL seam queryOne.');
            }
            public function queryAll($mode = null)
            {
                if (str_contains($this->sql, '{{%setting}}')) { return $this->db->settings[$this->params[':module']] ?? []; }
                if (str_contains($this->sql, '{{%user}}')) { return $this->db->users; }
                if (str_contains($this->sql, '{{%contentcontainer_blocked_users}}')) {
                    return $this->db->blocks[$this->params[':container'] . ':' . $this->params[':other']] ?? [];
                }
                if (str_contains($this->sql, '{{%user_friendship}}')) { return $this->db->friends[$this->params[':owner']] ?? []; }
                if (str_contains($this->sql, '{{%matcher_chat_send_receipt}}')) { return $this->db->quotaRows; }
                throw new LogicException('Unexpected send SQL seam queryAll.');
            }
        };
    }
}
$state = ['status' => 'active', 'type' => 'direct', 'pair_low' => '1', 'pair_high' => '2'];
$facts = new SendFactConnection(); $sql = new SqlState($facts);
$eligibility = new NativeSendEligibility($sql, true);
$valid = $eligibility->snapshot($state);
check($valid['allowed'], 'two native directions and zero blocks authorize current sending');
$friendPositions = $blockPositions = [];
foreach ($facts->calls as $index => [$query, $params]) {
    if (str_contains($query, '{{%user_friendship}}')) { $friendPositions[] = $index; }
    if (str_contains($query, '{{%contentcontainer_blocked_users}}')) { $blockPositions[] = $index; }
    if (!str_contains($query, 'information_schema')) { check(str_ends_with($query, 'FOR UPDATE'), 'all native facts use current locking reads'); }
}
check(count($friendPositions) === 2 && count($blockPositions) === 2 && max($blockPositions) < min($friendPositions), 'block absence keys locked before both friendship rows');
foreach (['friendship', 'matcher-chat'] as $name) {
    $original = $facts->settings[$name];
    foreach ([[], [['value' => '0']], [['value' => 'true'], ['value' => 'true']]] as $setting) {
        $facts->settings[$name] = $setting;
        check(!$eligibility->snapshot($state)['allowed'], 'missing disabled or duplicate setting cannot authorize');
    }
    $facts->settings[$name] = $original;
}
foreach ([1, 2] as $direction) {
    $original = $facts->friends[$direction]; $facts->friends[$direction] = [];
    check(!$eligibility->snapshot($state)['allowed'], 'pending/one-sided friendship denied');
    $facts->friends[$direction] = [$original[0], $original[0]];
    check(!$eligibility->snapshot($state)['allowed'], 'duplicate friendship rows denied');
    $facts->friends[$direction] = $original;
}
foreach (['101:2', '102:1'] as $block) {
    $facts->blocks[$block] = [['contentcontainer_id' => 101, 'user_id' => 2]];
    check(!$eligibility->snapshot($state)['allowed'], 'either blocking direction denied');
    unset($facts->blocks[$block]);
}
foreach ([0, 1] as $index) {
    $facts->users[$index]['status'] = '0'; check(!$eligibility->snapshot($state)['allowed'], 'either disabled account denied');
    $facts->users[$index]['status'] = '1';
}
$facts->friends[1][0]['id'] = '13';
$recreated = $eligibility->snapshot($state);
check($recreated['allowed'] && $recreated['fingerprint'] !== $valid['fingerprint'], 'observed recreated relation changes revision facts');
check($eligibility->snapshot($state)['allowed'], 'valid current native facts still accepted');
$revoked = $state; $revoked['status'] = 'revoked'; check(!$eligibility->snapshot($revoked)['allowed'], 'revoked never gains sending');
$group = $state; $group['type'] = 'group'; check(!$eligibility->snapshot($group)['allowed'], 'group not promoted by pair shape');
$facts->activeTransaction = false;
try { $eligibility->snapshot($state); throw new RuntimeException('Missing transaction accepted.'); }
catch (LogicException) { check(true, 'eligibility refuses missing transaction'); }
$facts->activeTransaction = true;
foreach (['matcher_chat_send_receipt', 'user_friendship', 'contentcontainer_blocked_users', 'setting'] as $table) {
    $db = new SendFactConnection(); $db->missing = [$table];
    check(!(new NativeSendEligibility(new SqlState($db), true))->snapshot($state)['allowed'], 'missing send dependency disables capability');
}
$db = new SendFactConnection(); $db->engine = 'MyISAM';
check(!(new NativeSendEligibility(new SqlState($db), true))->ready(), 'nontransactional native facts refused');
$db = new SendFactConnection();
check(!(new NativeSendEligibility(new SqlState($db), false))->snapshot($state)['allowed'] && $db->calls === [], 'configuration gate closed performs no relationship query');

foreach (["<&>\"' &lt;b&gt;", '<script>never execute()</script>', '<p>x</p><br>y', "\r\nfirst\nsecond\t", '中文🙂é', '  text  ', '@user **markdown** [file](upload://1)', str_repeat('🙂', 4000)] as $body) {
    $input = new SendText('12345678-1234-4234-8234-123456789012', $body);
    $encoded = SqlSendStore::nativeText($input->body);
    check(NativeProjection::text($encoded) === $body, 'HTML/entities/Unicode/line-ending plain text round trip');
    check(!str_contains($encoded, '<'), 'stored text cannot create raw HTML tags');
}
$writes = new SqlSendStore($sql, new SqlReadStore($sql, 1), 1);
try { $writes->receipt(1, 10, '12345678-1234-4234-8234-123456789012'); throw new RuntimeException('Unowned send boundary accepted.'); }
catch (LogicException) { check(true, 'SQL adapter cannot be called outside owned send boundary'); }
(new ReflectionProperty(SqlSendStore::class, 'active'))->setValue($writes, true);
$facts->receiptRows = [['entry_id' => '100', 'seq' => '8', 'body_hash' => str_repeat('a', 64)]];
$receipt = $writes->receipt(1, 10, '12345678-1234-4234-8234-123456789012');
check($receipt->entryId === 100 && $receipt->seq === 8, 'SQL receipt retains native entry and local sequence');
$last = $facts->calls[array_key_last($facts->calls)];
check($last[1][':message'] === 10 && $last[1][':viewer'] === 1 && str_contains($last[0], 'client_message_id=:key'), 'SQL receipt key scope is conversation/sender/client key');
$facts->quotaRows = array_fill(0, 60, ['created_at' => '950']);
try { $writes->assertQuota(1); throw new RuntimeException('Full quota accepted.'); }
catch (ChatException $error) { check($error->errorCode === 'RATE_LIMITED' && $error->retryAfterSeconds === 10, 'SQL server-time quota returns precise delay'); }
$facts->quotaRows = array_fill(0, 59, ['created_at' => '950']); $writes->assertQuota(1); check(true, 'SQL quota under 60 allowed');
$last = $facts->calls[array_key_last($facts->calls)];
check($last[1] === [':viewer' => 1, ':since' => 940] && str_contains($last[0], 'FOR UPDATE'), 'SQL quota uses locked rolling 60 second range');

$method = $_SERVER['REQUEST_METHOD'] ?? null;
$_SERVER['REQUEST_METHOD'] = 'POST';
$request = new \yii\web\Request(['enableCookieValidation' => false]);
$request->setPathInfo('api/v1/conversations/10/messages'); $request->setQueryParams([]); $request->setRawBody('{invalid');
$request->headers->set('Content-Type', 'application/json'); RequestBoundary::prepare($request);
check($request->bodyParams === [] && $request->rawBody === '{invalid' && $request->enableCsrfValidation, 'send JSON boundary retains raw validation and CSRF');
if ($method === null) { unset($_SERVER['REQUEST_METHOD']); } else { $_SERVER['REQUEST_METHOD'] = $method; }
$source = file_get_contents(dirname(__DIR__) . '/adapters/persistence/SqlSendStore.php');
foreach (['->notify(', 'ReplyForm', 'postProcess(', '->off(', 'last_viewed', '->mail(', '->send('] as $forbidden) {
    check(!str_contains($source, $forbidden), 'send adapter has no unsafe native form/notification/guard disabling path');
}
foreach (['updated_at', 'updated_by', 'created_at', 'created_by', 'synchronize(', 'invalidateNewMessageCountCache'] as $required) { check(str_contains($source, $required), 'native persistence semantics explicitly maintained'); }
echo json_encode(['status' => 'passed', 'checks' => $checks, 'native_checks' => $native['checks'], 'database_connections' => 0,
    'http_requests' => 0, 'scope' => 'real adapter SQL seams, encoding and static effect boundaries; not MySQL locks'], JSON_THROW_ON_ERROR), PHP_EOL;
