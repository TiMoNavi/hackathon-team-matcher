<?php
declare(strict_types=1);
$app = require __DIR__ . '/s77_audit_bootstrap.php';
$users = []; $suffix = bin2hex(random_bytes(4));
foreach (['owner', 'viewer', 'stranger', 'ai', 'revoked', 'lifecycle', 'privacy', 'content'] as $role) {
    $user = new humhub\modules\user\models\User(); $user->username = 's77_audit_' . $role . '_' . $suffix;
    $user->email = $user->username . '@example.invalid'; $user->status = 1; $user->language = 'en-US';
    if (!$user->save(false)) { throw new RuntimeException('S77 audit synthetic user creation failed.'); }
    $profile = new humhub\modules\user\models\Profile(); $profile->user_id = $user->id;
    if (!$profile->save(false)) { throw new RuntimeException('S77 audit synthetic profile creation failed.'); }
    $users[$role] = (int)$user->id;
}
$spaces = (new yii\db\Query())->select('id')->from('{{%space}}')->orderBy('id')->limit(2)->column($app->db);
if (count($spaces) !== 2) { throw new RuntimeException('S77 audit requires two existing cloned Spaces.'); }
foreach ($spaces as $spaceId) { foreach ($users as $role => $id) { if ($role !== 'stranger') { $app->db->createCommand()->upsert('{{%space_membership}}', ['space_id' => (int)$spaceId, 'user_id' => $id, 'status' => 3])->execute(); } } }
echo json_encode(['database' => 'humhub_profile_s77_test_audit_a8c52e14', 'origin' => 'http://127.0.0.1:8107', 'users' => $users, 'spaces' => array_map('intval', $spaces)], JSON_THROW_ON_ERROR), PHP_EOL;
