<?php
declare(strict_types=1);
/** Rollback-only follow-up for an already joined, registry-owned synthetic member. */
if (PHP_SAPI !== 'cli' || count($argv) !== 1) { exit(2); }
ob_start(); $checks = []; $transaction = null;
try {
    $app = require __DIR__ . '/bootstrap.php';
    if (!in_array('matcher-event-access', $isolatedConfig['modules'], true)) { throw new RuntimeException('guard'); }
    $path = $isolatedRuntime . '/n05-synthetic-fixtures.json';
    if (!is_file($path) || is_link($path) || (fileperms($path) & 0777) !== 0600) { throw new RuntimeException('guard'); }
    $fixture = json_decode(file_get_contents($path), true, 20, JSON_THROW_ON_ERROR);
    if (($fixture['kind'] ?? null) !== 'n05-synthetic-v1' || ($fixture['nonce'] ?? null) !== $isolatedConfig['nonce'] || !preg_match('/^n05_[a-f0-9]{12}$/D', $fixture['prefix'] ?? '')) { throw new RuntimeException('guard'); }
    $users = [];
    foreach (['owner', 'outsider'] as $role) {
        $name = $fixture['prefix'] . '_' . $role;
        $user = humhub\modules\user\models\User::findOne(['id' => $fixture['actors'][$role]['user_id'] ?? null, 'username' => $name, 'email' => $name . '@example.invalid']);
        if (!$user) { throw new RuntimeException('guard'); }
        $users[$role] = $user;
    }
    $space = humhub\modules\space\models\Space::findOne(['id' => $fixture['spaces']['a'] ?? null, 'name' => $fixture['prefix'] . '_space_a', 'created_by' => $users['owner']->id]);
    if (!$space) { throw new RuntimeException('guard'); }
    $db = $app->db; $actor = (int)$users['outsider']->id; $spaceId = (int)$space->id;
    $check = static function (string $name, bool $passed) use (&$checks): void { $checks[] = ['case_id' => $name, 'pass' => $passed]; if (!$passed) { throw new RuntimeException('assertion'); } };
    $lifecycle = new humhub\modules\matcherEventAccess\adapters\native\NativeMembershipLifecycle($db);
    $native = new humhub\modules\matcherEventAccess\adapters\native\NativeMembershipGateway($db, $lifecycle);
    $member = $native->current($actor, $spaceId);
    $check('registered_synthetic_member_exists', $member !== null && $member['membership_role'] === 'member');
    $transaction = $db->beginTransaction(yii\db\Transaction::SERIALIZABLE);
    try {
        $db->createCommand()->update('space_membership', ['group_id' => 'owner'], ['id' => $member['membership_id'], 'user_id' => $actor, 'space_id' => $spaceId])->execute();
        $permission = new humhub\modules\space\permissions\InviteUsers();
        foreach (['owner' => 1, 'member' => 0] as $group => $state) {
            $db->createCommand()->upsert(humhub\modules\content\models\ContentContainerPermission::tableName(), ['contentcontainer_id' => (int)$space->contentcontainer_id, 'group_id' => $group, 'module_id' => $permission->getModuleId(), 'permission_id' => $permission->getId(), 'class' => $permission::class, 'state' => $state])->execute();
        }
        $check('noncreator_stored_owner_normalizes_to_member', ($native->current($actor, $spaceId)['membership_role'] ?? null) === 'member');
        $denied = false;
        try { $native->assertIssuer($actor, $spaceId); }
        catch (humhub\modules\matcherEventAccess\domain\EventAccessException $error) { $denied = $error->errorCode === 'ACCESS_DENIED'; }
        $check('stored_owner_cannot_escalate_invitation_permission', $denied);
    } finally {
        if ($transaction->isActive) { $transaction->rollBack(); }
        $lifecycle->clearAfterFailure($actor);
    }
    $check('original_membership_restored_after_rollback', $native->current($actor, $spaceId) === $member);
    while (ob_get_level() > 0) { ob_end_clean(); }
    echo json_encode(['kind' => 'n05-native-role-followup-v1', 'status' => 'passed', 'checks' => count($checks), 'cases' => $checks, 'all_mutations_rolled_back' => true, 'synthetic_only' => true, 'external_calls' => 0]), PHP_EOL;
} catch (Throwable $error) {
    if ($transaction?->isActive) { $transaction->rollBack(); }
    while (ob_get_level() > 0) { ob_end_clean(); }
    echo json_encode(['kind' => 'n05-native-role-followup-v1', 'status' => 'failed', 'checks' => count($checks), 'cases' => $checks, 'error_type' => get_class($error), 'raw_suppressed' => true]), PHP_EOL;
    exit(1);
}
