<?php
declare(strict_types=1);
/** Fixed isolated synthetic fixtures only. Never creates or impersonates a real account. */
if (PHP_SAPI !== 'cli' || !in_array($argv[1] ?? '', ['prepare', 'revoke-target', 'revoke-member', 'restore-member', 'inspect'], true)) { exit(2); }
ob_start();
$stage = 'bootstrap';
$invalidFields = [];
try {
    $action = $argv[1];
    $app = require __DIR__ . '/bootstrap.php';
    if (!in_array('matcher-event-access', $isolatedConfig['modules'], true)) { throw new RuntimeException('N05 module is required.'); }
    $path = $isolatedRuntime . '/n05-synthetic-fixtures.json';
    $write = static function (array $data) use ($path): void {
        if (is_link($path)) { throw new RuntimeException('Unexpected fixture path.'); }
        $temporary = $path . '.pending-' . bin2hex(random_bytes(8));
        if (file_put_contents($temporary, json_encode($data, JSON_THROW_ON_ERROR), LOCK_EX) === false || !chmod($temporary, 0600) || !rename($temporary, $path)) { throw new RuntimeException('Fixture persistence failed.'); }
    };
    $save = static function ($model) use (&$invalidFields): void { if (!$model->save()) { $invalidFields = array_values(array_filter(array_keys($model->getErrors()), static fn($key) => is_string($key) && preg_match('/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/D', $key))); throw new RuntimeException('Synthetic native model validation failed: ' . get_class($model)); } };
    if (file_exists($path)) {
        if (is_link($path) || (fileperms($path) & 0777) !== 0600) { throw new RuntimeException('Fixture permissions invalid.'); }
        $state = json_decode(file_get_contents($path), true, 20, JSON_THROW_ON_ERROR);
        if (($state['nonce'] ?? null) !== $isolatedConfig['nonce'] || ($state['kind'] ?? null) !== 'n05-synthetic-v1') { throw new RuntimeException('Fixture provenance invalid.'); }
    } else {
        if ($action !== 'prepare') { throw new RuntimeException('Fixture does not exist.'); }
        $state = ['kind' => 'n05-synthetic-v1', 'nonce' => $isolatedConfig['nonce'], 'prefix' => 'n05_' . bin2hex(random_bytes(6)), 'actors' => [], 'spaces' => []];
        $write($state);
    }
    if ($action === 'prepare') {
        $stage = 'create-synthetic-users';
        foreach (['owner', 'member', 'target', 'outsider', 'racer_a', 'racer_b'] as $role) {
            $name = $state['prefix'] . '_' . $role;
            if (!isset($state['actors'][$role])) {
                if (humhub\modules\user\models\User::find()->where(['username' => $name])->exists()) { throw new RuntimeException('Unowned synthetic account collision.'); }
                $user = new humhub\modules\user\models\User(['username' => $name, 'email' => $name . '@example.invalid', 'status' => humhub\modules\user\models\User::STATUS_ENABLED, 'language' => 'en-US']);
                $save($user);
                $user->profile->firstname = 'Synthetic';
                $user->profile->lastname = 'N05 ' . $role;
                $save($user->profile);
                $state['actors'][$role] = ['user_id' => (int)$user->id, 'username' => $name, 'session_id' => bin2hex(random_bytes(24))];
                $write($state);
            }
        }
    }
    $users = [];
    $stage = 'validate-synthetic-users';
    foreach ($state['actors'] as $role => $record) {
        $user = humhub\modules\user\models\User::findOne(['id' => $record['user_id'], 'username' => $state['prefix'] . '_' . $role, 'email' => $state['prefix'] . '_' . $role . '@example.invalid']);
        if (!$user || $record['username'] !== $user->username) { throw new RuntimeException('Synthetic identity changed.'); }
        $users[$role] = $user;
    }
    if (count($users) !== 6) { throw new RuntimeException('Incomplete synthetic fixture; resume prepare.'); }
    $app->user->switchIdentity($users['owner']);
    if ($action === 'prepare') {
        $stage = 'create-synthetic-spaces';
        foreach (['a', 'b'] as $label) {
            if (!isset($state['spaces'][$label])) {
                $name = $state['prefix'] . '_space_' . $label;
                if (humhub\modules\space\models\Space::find()->where(['name' => $name])->exists()) { throw new RuntimeException('Unowned synthetic Space collision.'); }
                $space = new humhub\modules\space\models\Space(['name' => $name, 'description' => 'Synthetic N05 isolated authorization test. No real participant data.', 'visibility' => humhub\modules\space\models\Space::VISIBILITY_NONE, 'join_policy' => humhub\modules\space\models\Space::JOIN_POLICY_NONE]);
                // CLI fixture provisioning is not a test of the public create-Space permission.
                // Validate structure, then use native save/afterSave without granting a global admin role.
                if (!$space->validate(['name', 'description', 'join_policy']) || !$space->save(false)) { throw new RuntimeException('Synthetic Space provisioning failed.'); }
                $state['spaces'][$label] = (int)$space->id;
                $write($state);
            }
        }
    }
    $spaces = [];
    $stage = 'validate-synthetic-spaces';
    foreach ($state['spaces'] as $label => $id) {
        $space = humhub\modules\space\models\Space::findOne(['id' => $id, 'name' => $state['prefix'] . '_space_' . $label, 'created_by' => $users['owner']->id]);
        if (!$space) { throw new RuntimeException('Synthetic Space provenance changed.'); }
        $spaces[$label] = $space;
    }
    if (count($spaces) !== 2) { throw new RuntimeException('Incomplete synthetic spaces.'); }
    if ($action === 'prepare') {
        $stage = 'ensure-synthetic-memberships';
        // Resume an interrupted prepare only after revalidating the registered Space.
        foreach ($spaces as $space) {
            $membership = ['space_id' => $space->id, 'user_id' => $users['member']->id, 'status' => humhub\modules\space\models\Membership::STATUS_MEMBER];
            if (!humhub\modules\space\models\Membership::find()->where($membership)->exists()) {
                if (!$space->addMember((int)$users['member']->id, 1, true) || !humhub\modules\space\models\Membership::find()->where($membership)->exists()) { throw new RuntimeException('Synthetic initial membership failed.'); }
            }
        }
        foreach ($state['actors'] as $role => $record) {
            $stage = 'create-synthetic-sessions';
            $session = new yii\web\Session(['savePath' => $isolatedRuntime . '/sessions', 'name' => 'overnight_n01_session', 'useCookies' => false]);
            $session->setId($record['session_id']);
            $session->open();
            $session->set('__id', (int)$users[$role]->id);
            $session->set('__authKey', $users[$role]->getAuthKey());
            $session->set('__n05_synthetic', $state['prefix']);
            $session->close();
        }
    }
    if (in_array($action, ['revoke-target', 'revoke-member'], true)) {
        $role = $action === 'revoke-target' ? 'target' : 'member';
        $spaces['a']->removeMember((int)$users[$role]->id);
        if (humhub\modules\space\models\Membership::find()->where(['space_id' => $spaces['a']->id, 'user_id' => $users[$role]->id, 'status' => humhub\modules\space\models\Membership::STATUS_MEMBER])->exists()) { throw new RuntimeException('Synthetic membership removal failed.'); }
    }
    if ($action === 'restore-member' && !$spaces['a']->addMember((int)$users['member']->id, 1, true)) { throw new RuntimeException('Synthetic membership restoration failed.'); }
    $result = ['status' => 'passed', 'action' => $action, 'synthetic_users' => count($users), 'synthetic_spaces' => count($spaces), 'real_user_modified' => false, 'real_authentication_test' => false, 'external_calls' => 0];
    ob_end_clean();
    echo json_encode($result, JSON_THROW_ON_ERROR), PHP_EOL;
} catch (Throwable $error) {
    while (ob_get_level() > 0) { ob_end_clean(); }
    fwrite(STDERR, json_encode(['status' => 'failed', 'type' => get_class($error), 'stage' => $stage, 'location' => basename($error->getFile()) . ':' . $error->getLine(), 'invalid_fields' => $invalidFields, 'reason' => 'Synthetic N05 fixture failed; private diagnostics suppressed.']) . PHP_EOL);
    exit(1);
}
