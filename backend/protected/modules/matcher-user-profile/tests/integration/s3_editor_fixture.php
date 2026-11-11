<?php
declare(strict_types=1);
/** Fresh synthetic S3 user with raw native candidates, never the preview database. */
ob_start();
require dirname(__DIR__, 3) . '/matcher-profile-privacy/tests/integration/s3_fixture.php';
$fixture = json_decode(ob_get_clean(), true, 16, JSON_THROW_ON_ERROR);
$count = $app->db->createCommand()->update('{{%profile}}', [
    'firstname' => '合成旧姓名', 'lastname' => null,
    'title' => '合成旧头衔', 'matcher_nickname' => '旧昵称待确认',
], ['user_id' => $fixture['users']['owner']])->execute();
if ($count !== 1) { throw new RuntimeException('Synthetic profile row was not created.'); }
echo json_encode($fixture, JSON_THROW_ON_ERROR), PHP_EOL;
