<?php
declare(strict_types=1);
/** Root executes after HTTP initial+revoked phases. Fixed synthetic registry; no arbitrary SQL/input. */
if (PHP_SAPI !== 'cli' || ($argv[1] ?? '') !== 'rollback-cache' || count($argv) !== 2) { exit(2); }
ob_start();
$checks = [];
try {
    $app = require __DIR__ . '/bootstrap.php';
    if (!in_array('matcher-event-access', $isolatedConfig['modules'], true)) { throw new RuntimeException('guard'); }
    $path = $isolatedRuntime . '/n05-synthetic-fixtures.json';
    if (!is_file($path) || is_link($path) || (fileperms($path) & 0777) !== 0600) { throw new RuntimeException('guard'); }
    $fixture = json_decode(file_get_contents($path), true, 20, JSON_THROW_ON_ERROR);
    if (($fixture['kind'] ?? null) !== 'n05-synthetic-v1' || ($fixture['nonce'] ?? null) !== $isolatedConfig['nonce']
        || !is_string($fixture['prefix'] ?? null) || !preg_match('/^n05_[a-f0-9]{12}$/D', $fixture['prefix'])) { throw new RuntimeException('guard'); }
    $users = [];
    foreach (['owner', 'member', 'target', 'outsider', 'racer_a', 'racer_b'] as $role) {
        $record = $fixture['actors'][$role] ?? [];
        $name = $fixture['prefix'] . '_' . $role;
        $user = humhub\modules\user\models\User::findOne(['id' => $record['user_id'] ?? null, 'username' => $name, 'email' => $name . '@example.invalid']);
        if (!$user || ($record['username'] ?? null) !== $name) { throw new RuntimeException('guard'); }
        $users[$role] = $user;
    }
    $space = humhub\modules\space\models\Space::findOne(['id' => $fixture['spaces']['a'] ?? null,
        'name' => $fixture['prefix'] . '_space_a', 'created_by' => $users['owner']->id]);
    if (!$space) { throw new RuntimeException('guard'); }
    $actor = (int)$users['outsider']->id;
    $spaceId = (int)$space->id;
    $db = $app->db;
    $check = static function (string $label, bool $passed) use (&$checks): void {
        $checks[] = ['case_id' => $label, 'pass' => $passed];
        if (!$passed) { throw new RuntimeException('assertion'); }
    };
    $count = static function (string $table, array $where = []) use ($db): int {
        return (int)(new yii\db\Query())->from($table)->where($where)->count('*', $db);
    };
    $check('registered_synthetic_actor_has_no_a_membership', $count('space_membership', ['user_id' => $actor, 'space_id' => $spaceId]) === 0);
    $check('native_queue_table_available', $db->schema->getTableSchema('queue', true) !== null);
    // No queue worker, auth transport, OAuth or model is invoked by this test.
    $app->user->switchIdentity($users['owner']);
    $lifecycle = new humhub\modules\matcherEventAccess\adapters\native\NativeMembershipLifecycle($db);
    $native = new humhub\modules\matcherEventAccess\adapters\native\NativeMembershipGateway($db, $lifecycle);
    $store = new humhub\modules\matcherEventAccess\adapters\persistence\SqlEventAccessStore($db);
    $service = new humhub\modules\matcherEventAccess\application\EventAccessService($store, $native);
    $key = 'native-audit-' . bin2hex(random_bytes(12));
    $invitation = $service->create((int)$users['owner']->id, $spaceId, gmdate('Y-m-d\TH:i:s\Z', time() + 3600), 1, $key, 'create_invitation');
    $invitationId = $invitation['invitation_id'];
    $token = $invitation['token'];
    $check('native_invitation_created', is_string($token) && preg_match('/^[A-Za-z0-9_-]{43}$/D', $token) === 1);
    $app->user->switchIdentity($users['outsider']);
    $snapshot = static function () use ($db, $count, $actor, $spaceId, $invitationId): array {
        return [
            'membership' => $count('space_membership', ['user_id' => $actor, 'space_id' => $spaceId]),
            'uses' => (int)(new yii\db\Query())->select('uses')->from('matcher_event_invitation')->where(['id' => $invitationId])->scalar($db),
            'receipt' => $count('matcher_event_receipt', ['actor_id' => $actor, 'invitation_id' => $invitationId]),
            'outbox' => $count('matcher_event_outbox', ['actor_id' => $actor, 'space_id' => $spaceId]),
            'queue' => $count('queue'),
            'activity' => $count('activity'),
            'notification' => $count('notification'),
            'follow' => $count('user_follow', ['user_id' => $actor]),
        ];
    };
    $before = $snapshot();
    $decorated = new class($native) implements humhub\modules\matcherEventAccess\domain\ports\MembershipGateway {
        public string $mode = 'throw_after_join';
        public function __construct(private humhub\modules\matcherEventAccess\domain\ports\MembershipGateway $native) {}
        public function assertActor(int $actorId): void { $this->native->assertActor($actorId); }
        public function assertIssuer(int $actorId, int $spaceId): void { $this->native->assertIssuer($actorId, $spaceId); }
        public function assertCanAccept(int $actorId, int $spaceId): void { $this->native->assertCanAccept($actorId, $spaceId); }
        public function current(int $actorId, int $spaceId): ?array { return $this->native->current($actorId, $spaceId); }
        public function joined(int $actorId, int $afterId, int $limit): array { return $this->native->joined($actorId, $afterId, $limit); }
        public function join(int $actorId, int $spaceId): array {
            $member = $this->native->join($actorId, $spaceId);
            if ($this->mode === 'throw_after_join') { throw new humhub\modules\matcherEventAccess\domain\EventAccessException('INDEPENDENT_ROLLBACK', 'Synthetic rollback.', 503); }
            // Simulate another reader repopulating old shared cache while SQL has not committed.
            Yii::$app->cache->set(humhub\modules\space\models\Membership::USER_SPACES_CACHE_KEY . $actorId, []);
            Yii::$app->cache->set(humhub\modules\space\models\Membership::USER_SPACEIDS_CACHE_KEY . $actorId, []);
            return $member;
        }
    };
    $subject = new humhub\modules\matcherEventAccess\application\EventAccessService($store, $decorated);
    $joinKey = 'native-join-' . bin2hex(random_bytes(12));
    $attemptsBefore = $count('matcher_event_attempt', ['actor_id' => $actor, 'operation' => 'redeem']);
    $failureCode = null;
    try { $subject->redeem($actor, $token, 'join', $joinKey); }
    catch (humhub\modules\matcherEventAccess\domain\EventAccessException $error) { $failureCode = $error->errorCode; }
    $lifecycle->clearAfterFailure($actor);
    $check('forced_failure_occurs_after_native_join', $failureCode === 'INDEPENDENT_ROLLBACK');
    $check('rollback_member_quota_receipt_outbox_queue_activity', $snapshot() === $before);
    $check('rollback_does_not_erase_rate_attempt', $count('matcher_event_attempt', ['actor_id' => $actor, 'operation' => 'redeem']) === $attemptsBefore + 1);
    $check('rollback_does_not_leave_open_transaction', !$db->getTransaction()?->isActive);
    $check('rollback_current_membership_absent', $native->current($actor, $spaceId) === null);

    $hookRan = false;
    $hook = static function () use (&$hookRan): void { $hookRan = true; };
    yii\base\Event::on(humhub\modules\space\models\Membership::class, 'afterInsert', $hook);
    $guardCode = null;
    try { $service->redeem($actor, $token, 'join', 'unknown-hook-' . bin2hex(random_bytes(10))); }
    catch (humhub\modules\matcherEventAccess\domain\EventAccessException $error) { $guardCode = $error->errorCode; }
    finally { yii\base\Event::off(humhub\modules\space\models\Membership::class, 'afterInsert', $hook); }
    $lifecycle->clearAfterFailure($actor);
    $check('unknown_native_hook_fails_before_execution', $guardCode === 'NATIVE_LIFECYCLE_UNSUPPORTED' && !$hookRan);
    $check('unknown_hook_failure_leaves_no_business_effect', $snapshot() === $before);

    $decorated->mode = 'seed_stale_cache';
    $receipt = $subject->redeem($actor, $token, 'join', $joinKey);
    $committed = $snapshot();
    $check('successful_retry_has_current_native_membership', $receipt['outcome'] === 'joined' && $receipt['membership_current'] === true && $receipt['consumed_use'] === true);
    $check('one_native_membership_quota_receipt', $committed['membership'] === 1 && $committed['uses'] === 1 && $committed['receipt'] === 1);
    $check('outbox_durable_before_dispatch', $committed['outbox'] >= 1 && $count('matcher_event_outbox', ['actor_id' => $actor, 'space_id' => $spaceId, 'status' => 'pending']) === $committed['outbox']);
    $check('queue_activity_unchanged_until_explicit_flush', $committed['queue'] === $before['queue'] && $committed['activity'] === $before['activity']);
    $check('stale_cache_was_seeded_before_commit', $app->cache->get(humhub\modules\space\models\Membership::USER_SPACES_CACHE_KEY . $actor) === [] && $app->cache->get(humhub\modules\space\models\Membership::USER_SPACEIDS_CACHE_KEY . $actor) === []);
    $lifecycle->flush($actor);
    $flushed = $snapshot();
    $check('commit_flush_clears_user_space_caches', $app->cache->get(humhub\modules\space\models\Membership::USER_SPACES_CACHE_KEY . $actor) === false && $app->cache->get(humhub\modules\space\models\Membership::USER_SPACEIDS_CACHE_KEY . $actor) === false);
    $check('postcommit_native_cache_read_includes_space', in_array($spaceId, array_map('intval', humhub\modules\space\models\Membership::getUserSpaceIds($actor)), true));
    $check('outbox_fully_dispatched_no_failed_or_uncertain', $count('matcher_event_outbox', ['actor_id' => $actor, 'space_id' => $spaceId, 'status' => 'dispatched']) === $committed['outbox']);
    $replayed = $service->redeem($actor, $token, 'join', $joinKey);
    $lifecycle->flush($actor);
    $check('successful_replay_same_receipt', $replayed === $receipt);
    $check('successful_replay_creates_no_effects', $snapshot() === $flushed);
    $check('native_mutation_never_selects_current_event', $count(humhub\modules\matcherRecommendation\adapters\native\CurrentEventSelectionSchema::TABLE, ['actor_id' => $actor]) === 0);
    // Synthetic, rollback-only role fixture. Core Space semantics never trust a stored owner group.
    $roleTransaction = $db->beginTransaction(yii\db\Transaction::SERIALIZABLE);
    try {
        $db->createCommand()->update('space_membership', ['group_id' => 'owner'], ['id' => $receipt['membership_id'], 'user_id' => $actor, 'space_id' => $spaceId])->execute();
        $permission = new humhub\modules\space\permissions\InviteUsers();
        foreach (['owner' => 1, 'member' => 0] as $group => $state) {
            $db->createCommand()->upsert(humhub\modules\content\models\ContentContainerPermission::tableName(), [
                'contentcontainer_id' => (int)$space->contentcontainer_id, 'group_id' => $group,
                'module_id' => $permission->getModuleId(), 'permission_id' => $permission->getId(),
                'class' => $permission::class, 'state' => $state,
            ])->execute();
        }
        $check('noncreator_stored_owner_normalizes_to_native_member', ($native->current($actor, $spaceId)['membership_role'] ?? null) === 'member');
        $denied = false;
        try { $native->assertIssuer($actor, $spaceId); }
        catch (humhub\modules\matcherEventAccess\domain\EventAccessException $error) { $denied = $error->errorCode === 'ACCESS_DENIED'; }
        $check('noncreator_cannot_inherit_owner_invite_permission', $denied);
    } finally {
        if ($roleTransaction->isActive) { $roleTransaction->rollBack(); }
        $lifecycle->clearAfterFailure($actor);
    }
    $check('role_fixture_rolls_back_to_member', ($native->current($actor, $spaceId)['membership_role'] ?? null) === 'member');
    while (ob_get_level() > 0) { ob_end_clean(); }
    echo json_encode(['kind' => 'n05-independent-native-audit-v1', 'status' => 'passed', 'checks' => count($checks), 'cases' => $checks,
        'synthetic_registry_only' => true, 'real_provider_authentication' => false, 'queue_worker_started' => false,
        'http_calls' => 0, 'external_calls' => 0, 'limit' => 'Same-process real MySQL rollback/cache/outbox checks; concurrent transactions are separate.'], JSON_THROW_ON_ERROR), PHP_EOL;
} catch (Throwable $error) {
    while (ob_get_level() > 0) { ob_end_clean(); }
    $errorType = get_class($error);
    if (!preg_match('/^[A-Za-z_][A-Za-z0-9_\\\\]{0,200}$/D', $errorType)) { $errorType = 'Throwable'; }
    echo json_encode(['kind' => 'n05-independent-native-audit-v1', 'status' => 'failed', 'checks' => count($checks), 'cases' => $checks,
        'error_type' => $errorType, 'reason' => 'Native synthetic audit failed; private diagnostics suppressed.'], JSON_THROW_ON_ERROR), PHP_EOL;
    exit(1);
}
