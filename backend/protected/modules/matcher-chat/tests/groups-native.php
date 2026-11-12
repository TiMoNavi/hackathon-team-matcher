<?php
declare(strict_types=1);
ob_start(); require __DIR__ . '/native.php'; $native = json_decode(trim(ob_get_clean()), true, 8, JSON_THROW_ON_ERROR);
$checks = 0;

use humhub\modules\matcherChat\adapters\native\{NativeGroupAuthority, NativeGuard, NativeProjection};
use humhub\modules\matcherChat\adapters\persistence\{SqlGroupStore, SqlReadStore, SqlState};
use humhub\modules\matcherChat\domain\{ChatException, GroupReceipt};

/** Exact SQL seam. No PDO connection, application, service or real database. */
final class GroupFactConnection extends \yii\db\Connection
{
    public array $calls = [];
    public array $missing = [];
    public array $missingColumns = [];
    public string $engine = 'InnoDB';
    public bool $activeTransaction = true;
    public bool $uniquePending = true;
    public array $settings = ['matcher-chat' => [['value' => '1']], 'friendship' => [['value' => '1']]];
    public array $users = [['id' => 1, 'status' => 1, 'contentcontainer_id' => 101], ['id' => 2, 'status' => 1, 'contentcontainer_id' => 102]];
    public array $blocks = [];
    public array $friends = [1 => [['id' => 11, 'user_id' => 1, 'friend_user_id' => 2, 'created_at' => '2026-11-13 00:00:00']], 2 => [['id' => 12, 'user_id' => 2, 'friend_user_id' => 1, 'created_at' => '2026-11-13 00:00:00']]];
    public array $quotaRows = [];
    public ?array $receipt = null;
    public array $state;
    public array $message;
    public array $members;
    public array $nativeMembers;
    public bool $entryExists = false;
    public bool $mappedExists = false;
    public array $updates = [];
    public int $serverNow = 1000;
    public function __construct()
    {
        parent::__construct();
        $this->message = ['id' => 10, 'title' => 'Group <literal> & exact', 'created_by' => 1, 'updated_by' => 1, 'created_at' => '2026-11-13 00:00:00', 'updated_at' => '2026-11-13 00:00:00'];
        $this->nativeMembers = [['user_id' => 1, 'is_originator' => 1, 'created_at' => '2026-11-13 00:00:00', 'created_by' => 1]];
        $this->members = [['message_id' => 10, 'user_id' => 1, 'generation' => 1, 'join_seq' => 0, 'status' => 'active', 'version' => 1]];
        $this->state = ['message_id' => 10, 'type' => 'group', 'status' => 'active', 'pair_low' => null, 'pair_high' => null, 'owner_id' => 1, 'version' => 1, 'last_seq' => 0,
            'native_members_hash' => NativeProjection::membershipHash($this->nativeMembers),
            'native_projection_hash' => hash('sha256', json_encode([$this->message['title'], 1, $this->message['created_at'], 1, $this->message['updated_at']], JSON_THROW_ON_ERROR))];
    }
    public function getDriverName() { return 'mysql'; }
    public function getSchema()
    {
        return new class(['db' => $this]) extends \yii\db\Schema {
            protected function loadTableSchema($name) { return $this->getTableSchema($name); }
            public function getTableSchema($name, $refresh = false)
            {
                $name = trim($name, '{}%'); if (in_array($name, $this->db->missing, true)) { return null; }
                $table = new \yii\db\TableSchema(); $table->name = $name;
                $table->primaryKey = match ($name) { 'contentcontainer_blocked_users' => ['contentcontainer_id', 'user_id'], 'matcher_chat_group_receipt' => ['actor_id', 'operation', 'client_command_id'], default => ['id'] };
                $columns = match ($name) {
                    'matcher_chat_group_invitation' => ['id', 'message_id', 'inviter_id', 'invitee_id', 'pending_invitee_id', 'status', 'version', 'created_at', 'expires_at', 'resolved_at'],
                    'matcher_chat_group_receipt' => ['actor_id', 'operation', 'client_command_id', 'payload_hash', 'message_id', 'invitation_id', 'created_at'],
                    'matcher_chat_conversation' => ['pair_low', 'pair_high', 'owner_id'], 'matcher_chat_member' => ['version'], default => ['id'],
                };
                foreach ($columns as $column) {
                    if (in_array($name . '.' . $column, $this->db->missingColumns, true)) { continue; }
                    $schema = new \yii\db\ColumnSchema(); $schema->name = $column;
                    $schema->allowNull = in_array($column, ['pair_low', 'pair_high', 'owner_id', 'pending_invitee_id', 'resolved_at', 'invitation_id'], true);
                    $table->columns[$column] = $schema;
                }
                return $table;
            }
        };
    }
    public function getTransaction() { return new class(['db' => $this]) extends \yii\db\Transaction { public function getIsActive() { return $this->db->activeTransaction; } }; }
    public function createCommand($sql = null, $params = [])
    {
        $this->calls[] = [$sql, $params];
        return new class($this, $sql, $params) {
            public function __construct(private GroupFactConnection $db, private ?string $sql, private array $params) {}
            public function queryOne($mode = null)
            {
                $q = $this->sql; $p = $this->params;
                if (str_contains($q, 'information_schema.TABLES')) { return ['ENGINE' => $this->db->engine]; }
                if (str_contains($q, 'UNIX_TIMESTAMP')) { return ['now' => $this->db->serverNow]; }
                if (str_contains($q, '{{%matcher_chat_lock}}')) { return ['id' => 1]; }
                if (str_contains($q, '{{%matcher_chat_viewer_revision}}')) { return false; }
                if (str_contains($q, '{{%matcher_chat_group_receipt}}')) { return $this->db->receipt ?? false; }
                if (str_contains($q, '{{%matcher_chat_conversation}}')) { return ($p[':id'] ?? null) === 10 ? $this->db->state : false; }
                if (str_contains($q, '{{%matcher_chat_member}}')) {
                    $rows = array_values(array_filter($this->db->members, static fn ($r) => $r['user_id'] === ($p[':user'] ?? null)));
                    usort($rows, static fn ($a, $b) => $b['generation'] <=> $a['generation']); return $rows[0] ?? false;
                }
                if (str_contains($q, '{{%message_entry}}')) { return $this->db->entryExists ? ['id' => 100] : false; }
                if (str_contains($q, '{{%matcher_chat_entry_sequence}}')) { return $this->db->mappedExists ? ['entry_id' => 100] : false; }
                if (str_contains($q, '{{%message}}')) { return $this->db->message; }
                if (str_contains($q, '{{%user}}')) { foreach ($this->db->users as $row) { if ($row['id'] === ($p[':id'] ?? $p[':viewer'] ?? null)) { return $row; } } return false; }
                throw new LogicException('Unexpected group seam queryOne.');
            }
            public function queryAll($mode = null)
            {
                $q = $this->sql; $p = $this->params;
                if (str_contains($q, 'information_schema.STATISTICS')) { return [['COLUMN_NAME' => 'message_id', 'NON_UNIQUE' => $this->db->uniquePending ? 0 : 1], ['COLUMN_NAME' => 'pending_invitee_id', 'NON_UNIQUE' => $this->db->uniquePending ? 0 : 1]]; }
                if (str_contains($q, '{{%setting}}')) { return $this->db->settings[$p[':module']] ?? []; }
                if (str_contains($q, '{{%user}}')) { return $this->db->users; }
                if (str_contains($q, '{{%contentcontainer_blocked_users}}')) { return $this->db->blocks[$p[':container'] . ':' . $p[':other']] ?? []; }
                if (str_contains($q, '{{%user_friendship}}')) { return $this->db->friends[$p[':owner']] ?? []; }
                if (str_contains($q, '{{%matcher_chat_group_receipt}}')) { return $this->db->quotaRows; }
                if (str_contains($q, 'SELECT c.*')) { return ($p[':type'] ?? null) === 'direct' ? [] : [$this->db->state]; }
                if (str_contains($q, 'SELECT c.message_id')) {
                    foreach ($this->db->members as $member) { if ($member['user_id'] === $p[':user'] && ($this->db->state['type'] === $p[':direct'] || $this->db->state['type'] === $p[':group'] && $member['status'] === $p[':active'])) { return [['message_id' => 10]]; } } return [];
                }
                if (str_contains($q, '{{%matcher_chat_member}}')) { return array_values(array_filter($this->db->members, static fn ($r) => $r['status'] === 'active')); }
                if (str_contains($q, '{{%user_message}}')) { return isset($p[':user']) ? array_values(array_filter($this->db->nativeMembers, static fn ($r) => $r['user_id'] === $p[':user'])) : $this->db->nativeMembers; }
                throw new LogicException('Unexpected group seam queryAll.');
            }
            public function update($table, $columns, $condition) { $this->db->updates[] = [$table, $columns, $condition]; return $this; }
            public function insert($table, $columns) { $this->db->updates[] = [$table, $columns]; return $this; }
            public function execute() { return 1; }
        };
    }
}

$db = new GroupFactConnection(); $sql = new SqlState($db); $authority = new NativeGroupAuthority($sql, true);
check($sql->groupsReady() && $authority->ready(), 'complete InnoDB schema and unique pending key ready');
check($authority->enabled() && $authority->friendsUnblocked(1, 2), 'double gated current native friends qualify');
$blockPositions = $friendPositions = [];
foreach ($db->calls as $index => [$query]) {
    if (str_contains($query, '{{%contentcontainer_blocked_users}}')) { $blockPositions[] = $index; }
    if (str_contains($query, '{{%user_friendship}}')) { $friendPositions[] = $index; }
    if ($query !== null && !str_contains($query, 'information_schema')) { check(str_ends_with($query, 'FOR UPDATE'), 'native group facts use current row locks'); }
}
check(count($blockPositions) === 2 && max($blockPositions) < min($friendPositions), 'both absent block keys lock before friendship rows');
foreach (['matcher-chat', 'friendship'] as $setting) {
    $original = $db->settings[$setting];
    foreach ([[], [['value' => '0']], [['value' => '1'], ['value' => '1']]] as $rows) { $db->settings[$setting] = $rows; check(!$authority->friendsUnblocked(1, 2), 'absent/disabled/ambiguous settings reject group invitation'); }
    $db->settings[$setting] = $original;
}
foreach ([1, 2] as $direction) { $old = $db->friends[$direction]; $db->friends[$direction] = []; check(!$authority->friendsUnblocked(1, 2), 'one-sided friendship denied'); $db->friends[$direction] = [$old[0], $old[0]]; check(!$authority->friendsUnblocked(1, 2), 'duplicate friendship denied'); $db->friends[$direction] = $old; }
foreach (['101:2', '102:1'] as $key) { $db->blocks[$key] = [['user_id' => 2]]; check(!$authority->friendsUnblocked(1, 2), 'either block direction denied'); unset($db->blocks[$key]); }
foreach ([0, 1] as $index) { $db->users[$index]['status'] = 0; check(!$authority->friendsUnblocked(1, 2), 'inactive account denied'); $db->users[$index]['status'] = 1; }
foreach (['matcher_chat_group_invitation', 'matcher_chat_group_receipt', 'user_friendship', 'contentcontainer_blocked_users', 'setting'] as $table) { $bad = new GroupFactConnection(); $bad->missing = [$table]; check(!(new SqlGroupStore(new SqlState($bad), 1, true))->ready(), 'missing dependency fails closed'); }
foreach (['matcher_chat_conversation.owner_id', 'matcher_chat_member.version', 'matcher_chat_group_invitation.pending_invitee_id'] as $column) { $bad = new GroupFactConnection(); $bad->missingColumns = [$column]; check(!(new SqlState($bad))->groupsReady(), 'partial migration fails closed'); }
$bad = new GroupFactConnection(); $bad->uniquePending = false; check(!(new SqlState($bad))->groupsReady(), 'nonunique pending index fails closed');
$bad = new GroupFactConnection(); $bad->engine = 'MyISAM'; check(!(new SqlState($bad))->groupsReady(), 'nontransactional schema fails closed');
$closed = new SqlGroupStore($sql, 1, false); domainError(fn () => $closed->run(fn () => null), 'CHAT_GROUPS_UNAVAILABLE', 'configuration false cannot open transactions');
$store = new SqlGroupStore($sql, 1, true);
try { $store->group(10); throw new RuntimeException('Missing owned boundary accepted.'); } catch (LogicException) { check(true, 'SQL group store refuses reads outside its own boundary'); }
(new ReflectionProperty($store, 'active'))->setValue($store, true);
$group = $store->group(10); check($group->activeMemberCount === 1 && $group->title === $db->message['title'] && $group->lastSeq === 0, 'empty native group projects literal title and one owner');
check($store->nativeOwner(10, 1) && $store->nativeMember(10, 1) && !$store->nativeMember(10, 2), 'native ownership and membership facts are explicit');
$db->entryExists = true; domainError(fn () => $store->group(10), 'GROUP_HISTORY_UNAVAILABLE', 'unexpected native message not migrated'); $db->entryExists = false;
$db->mappedExists = true; domainError(fn () => $store->group(10), 'GROUP_HISTORY_UNAVAILABLE', 'mapped sequence also blocks empty-group scope'); $db->mappedExists = false;
$original = $db->nativeMembers; $db->nativeMembers = []; domainError(fn () => $store->group(10), 'CONVERSATION_UNAVAILABLE', 'native removal cannot be repaired'); $db->nativeMembers = $original;
$db->nativeMembers[0]['is_originator'] = 0; domainError(fn () => $store->group(10), 'CONVERSATION_UNAVAILABLE', 'owner originator flag required'); $db->nativeMembers[0]['is_originator'] = 1;
$db->state['pair_low'] = 1; domainError(fn () => $store->group(10), 'INVALID_GROUP_PROJECTION', 'group cannot carry a fake direct pair'); $db->state['pair_low'] = null;
$db->state['status'] = 'revoked'; check($store->group(10) === null, 'revoked group never reopens'); $db->state['status'] = 'active';
$quota = new ReflectionMethod($store, 'quota');
foreach (['create' => 5, 'invite' => 20] as $op => $limit) {
    $db->quotaRows = array_fill(0, $limit, ['created_at' => 950]);
    try { $quota->invoke($store, $op, $limit); throw new RuntimeException('Quota accepted.'); } catch (ChatException $e) { check($e->errorCode === 'RATE_LIMITED' && $e->httpStatus === 429 && $e->retryAfterSeconds === 10, 'persistent rolling quota is exact'); }
    $db->quotaRows = array_fill(0, $limit - 1, ['created_at' => 950]); $quota->invoke($store, $op, $limit); check(true, 'below quota admitted');
    $call = $db->calls[array_key_last($db->calls)]; check($call[1] === [':actor' => 1, ':operation' => $op, ':since' => 940] && str_contains($call[0], 'LIMIT ' . $limit . ' FOR UPDATE'), 'quota locks actor operation time range');
}
$db->receipt = ['actor_id' => 1, 'operation' => 'invite', 'client_command_id' => '12345678-1234-4234-8234-123456789012', 'payload_hash' => str_repeat('a', 64), 'message_id' => 10, 'invitation_id' => 7];
$receipt = $store->receipt(1, 'invite', $db->receipt['client_command_id']); check($receipt instanceof GroupReceipt && $receipt->invitationId === 7, 'permanent receipt uses full actor operation key');
domainError(fn () => $store->receipt(2, 'invite', $db->receipt['client_command_id']), 'CONVERSATION_UNAVAILABLE', 'request actor cannot be substituted');

// The same user can retain historical group generations without poisoning direct reads.
$reads = new SqlReadStore($sql, 1); (new ReflectionProperty($reads, 'active'))->setValue($reads, true);
(new ReflectionMethod($reads, 'prepare'))->invoke($reads);
check($reads->visibleIds(1, null, 24) === [], 'direct reader excludes lifecycle-only group');
$queries = array_filter($db->calls, static fn ($call) => is_string($call[0]) && str_contains($call[0], 'SELECT c.*'));
$query = array_values($queries)[0]; check(str_contains($query[0], 'c.type=:type AND m.generation=1') && $query[1][':type'] === 'direct', 'group generations excluded in SQL before scope limit');
$guard = new NativeGuard($sql); $db->members[0]['status'] = 'left'; $db->updates = [];
$guard->invalidateIdentity(1); check($db->updates === [], 'former group member account transition does not revoke group');
$db->members[0]['status'] = 'active'; $guard->invalidateIdentity(1); check(count($db->updates) === 2 && $db->updates[0][1]['status'] === 'revoked', 'current active member transition conservatively revokes group');
$db->updates = []; $db->state['type'] = 'direct'; $db->members[0]['status'] = 'left'; $guard->invalidateIdentity(1); check(count($db->updates) === 2, 'historical direct identity policy preserved');

$source = file_get_contents(dirname(__DIR__) . '/adapters/persistence/SqlGroupStore.php');
foreach (['->notify(', 'MessageUserJoined', 'MessageUserLeft', '->off(', 'new UserMessage', 'new Message('] as $forbidden) { check(!str_contains($source, $forbidden), 'no native AR or notification side effect'); }
foreach (['last_viewed', 'is_originator', 'invalidateNewMessageCountCache', 'native_members_hash', 'emptyHistory'] as $required) { check(str_contains($source, $required), 'explicit native lifecycle semantics'); }
echo json_encode(['status' => 'passed', 'checks' => $checks, 'native_checks' => $native['checks'], 'database_connections' => 0, 'http_requests' => 0,
    'scope' => 'SQL seams, schema gates, native authority locks, projections, quotas and direct isolation; not real MySQL concurrency.'], JSON_THROW_ON_ERROR), PHP_EOL;
