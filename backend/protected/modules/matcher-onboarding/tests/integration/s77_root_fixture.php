<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli' || ($argv[1] ?? '') !== 'humhub_profile_s77_test_root_f3a9d621'
    || (getenv('MATCHER_S77_TEST_DB') !== false && getenv('MATCHER_S77_TEST_DB') !== $argv[1])) {
    fwrite(STDERR, "S77 root fixture rejected before connection.\n"); exit(2);
}
putenv('MATCHER_S77_TEST_DB=' . $argv[1]);
$app = require __DIR__ . '/s77_http_bootstrap.php';
$spaces = (new yii\db\Query())->select('id')->from('{{%space}}')->orderBy('id')->limit(2)->column($app->db);
if (count($spaces) !== 2) { throw new RuntimeException('The isolated clone needs two Spaces.'); }
$users = []; $suffix = bin2hex(random_bytes(4));
$transaction = $app->db->beginTransaction();
try {
    foreach (['owner','viewer','stranger'] as $role) {
        $user = new humhub\modules\user\models\User();
        $user->username = 's77_root_' . $role . '_' . $suffix;
        $user->email = $user->username . '@example.invalid'; $user->status = 1; $user->language = 'en-US';
        if (!$user->save(false)) { throw new RuntimeException('Synthetic user failed.'); }
        $profile = new humhub\modules\user\models\Profile(); $profile->user_id = $user->id;
        if (!$profile->save(false)) { throw new RuntimeException('Synthetic profile failed.'); }
        $users[$role] = (int)$user->id;
    }
    foreach ($spaces as $spaceId) { foreach (['owner','viewer'] as $role) {
        $app->db->createCommand()->upsert('{{%space_membership}}', ['space_id' => (int)$spaceId, 'user_id' => $users[$role], 'status' => 3])->execute();
    } }
    $transaction->commit();
} catch (Throwable $e) { $transaction->rollBack(); throw $e; }
echo json_encode(['database' => 'humhub_profile_s77_test_root_f3a9d621', 'origin' => 'http://127.0.0.1:8106', 'users' => $users, 'spaces' => array_map('intval', $spaces)], JSON_THROW_ON_ERROR), PHP_EOL;
