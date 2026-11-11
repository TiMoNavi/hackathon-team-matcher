<?php
declare(strict_types=1);
$app = require __DIR__ . '/s3_http_bootstrap.php';
$users = []; $suffix = bin2hex(random_bytes(4));
foreach (['owner', 'viewer', 'stranger'] as $role) {
    $user = new humhub\modules\user\models\User();
    $user->username = 's3_' . $role . '_' . $suffix;
    $user->email = $user->username . '@example.invalid';
    $user->status = 1; $user->language = 'en-US';
    if (!$user->save(false)) { throw new RuntimeException('Synthetic user fixture failed.'); }
    $profile = new humhub\modules\user\models\Profile();
    $profile->user_id = $user->id;
    if (!$profile->save(false)) { throw new RuntimeException('Synthetic profile fixture failed.'); }
    $users[$role] = (int)$user->id;
}
$spaces = (new yii\db\Query())->select('id')->from('{{%space}}')->orderBy('id')->limit(2)->column($app->db);
if (count($spaces) !== 2) { throw new RuntimeException('The clone must contain two Space fixtures.'); }
foreach ($spaces as $spaceId) {
    foreach (['owner', 'viewer'] as $role) { $app->db->createCommand()->upsert('{{%space_membership}}', ['space_id' => (int)$spaceId, 'user_id' => $users[$role], 'status' => 3])->execute(); }
}
echo json_encode(['users' => $users, 'spaces' => array_map('intval', $spaces)], JSON_THROW_ON_ERROR), PHP_EOL;
