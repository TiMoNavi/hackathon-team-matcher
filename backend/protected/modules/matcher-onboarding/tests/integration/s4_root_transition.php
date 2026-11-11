<?php
declare(strict_types=1);
$app = require __DIR__ . '/s4_http_bootstrap.php';
$fixture = json_decode(file_get_contents($app->runtimePath . '/root-fixture.json'), true, 16, JSON_THROW_ON_ERROR);
$owner = (int)$fixture['users']['owner']; $space = (int)$fixture['spaces'][0];
$user = humhub\modules\user\models\User::findOne($owner);
if (!$user || !str_starts_with($user->username, 's4_')) { throw new RuntimeException('Synthetic fixture required.'); }
$action = $argv[2] ?? '';
if ($action === 'remove_membership') {
    $app->db->createCommand()->delete('{{%space_membership}}', ['user_id' => $owner, 'space_id' => $space])->execute();
} elseif ($action === 'restore_membership') {
    $app->db->createCommand()->upsert('{{%space_membership}}', ['user_id' => $owner, 'space_id' => $space, 'status' => 3])->execute();
} else { throw new RuntimeException('Unsupported synthetic transition.'); }
echo json_encode(['status' => 'passed', 'action' => $action], JSON_THROW_ON_ERROR), PHP_EOL;
