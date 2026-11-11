<?php
declare(strict_types=1);
/** Synthetic cross-account acceptance fixture. Only the mandatory isolated S3 bootstrap is used. */
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\user\models\User;
use humhub\modules\post\models\Post;
use humhub\modules\content\models\Content;
use yii\db\Query;

$app = require __DIR__ . '/s3_http_bootstrap.php';
$file = $app->runtimePath . '/root-fixture.json';
$action = $argv[2] ?? 'create';
$db = $app->db;
if ($action !== 'create') {
    $fixture = json_decode(file_get_contents($file), true, 32, JSON_THROW_ON_ERROR);
    foreach ($fixture['users'] as $id) {
        if (!str_starts_with((string)User::findOne($id)?->username, 's3_root_')) { throw new RuntimeException('Only synthetic root fixtures may change.'); }
    }
    $owner = $fixture['users']['owner']; $friend = $fixture['users']['friend']; $viewer = $fixture['users']['viewer'];
    switch ($action) {
        case 'friendship_remove':
            $db->createCommand()->delete('{{%user_friendship}}', ['or', ['user_id' => $owner, 'friend_user_id' => $friend], ['user_id' => $friend, 'friend_user_id' => $owner]])->execute(); break;
        case 'friendship_restore':
            foreach ([[$owner, $friend], [$friend, $owner]] as [$a, $b]) { $db->createCommand()->upsert('{{%user_friendship}}', ['user_id' => $a, 'friend_user_id' => $b, 'created_at' => gmdate('Y-m-d H:i:s')])->execute(); } break;
        case 'block':
            $db->createCommand()->upsert('{{%contentcontainer_blocked_users}}', ['contentcontainer_id' => User::findOne($owner)->contentcontainer_id, 'user_id' => $viewer])->execute(); break;
        case 'unblock':
            $db->createCommand()->delete('{{%contentcontainer_blocked_users}}', ['contentcontainer_id' => User::findOne($owner)->contentcontainer_id, 'user_id' => $viewer])->execute(); break;
        case 'member_remove':
            $db->createCommand()->delete('{{%space_membership}}', ['space_id' => $fixture['spaces'][0], 'user_id' => $viewer])->execute(); break;
        case 'member_restore':
            $db->createCommand()->upsert('{{%space_membership}}', ['space_id' => $fixture['spaces'][0], 'user_id' => $viewer, 'status' => 3])->execute(); break;
        case 'post_private': case 'post_public':
            $db->createCommand()->update('{{%content}}', ['visibility' => $action === 'post_public' ? Content::VISIBILITY_PUBLIC : Content::VISIBILITY_PRIVATE], ['id' => $fixture['content_id']])->execute(); break;
        default: throw new RuntimeException('Unknown fixture transition.');
    }
    echo json_encode(['status' => 'changed', 'action' => $action], JSON_THROW_ON_ERROR), PHP_EOL; exit;
}
if (is_file($file)) { throw new RuntimeException('This fixture already exists; reuse it or restore the clone.'); }
$users = []; $suffix = bin2hex(random_bytes(4));
foreach (['owner', 'viewer', 'friend', 'outsider', 'legacy', 'public_reader'] as $role) {
    $user = new User(); $user->username = 's3_root_' . $role . '_' . $suffix;
    $user->email = $user->username . '@example.invalid'; $user->status = User::STATUS_ENABLED; $user->language = 'en-US';
    if (!$user->save(false)) { throw new RuntimeException('Synthetic account could not be saved.'); }
    if (!(new Query())->from('{{%profile}}')->where(['user_id' => $user->id])->exists($db)) {
        $db->createCommand()->insert('{{%profile}}', ['user_id' => $user->id])->execute();
    }
    $users[$role] = (int)$user->id;
}
$spaces = array_map('intval', (new Query())->select('id')->from('{{%space}}')->orderBy('id')->limit(2)->column($db));
if (count($spaces) !== 2) { throw new RuntimeException('Two baseline Spaces are required.'); }
foreach ([[$users['owner'], $spaces[0]], [$users['owner'], $spaces[1]], [$users['viewer'], $spaces[0]], [$users['outsider'], $spaces[1]], [$users['legacy'], $spaces[0]]] as [$userId, $spaceId]) {
    $db->createCommand()->upsert('{{%space_membership}}', ['user_id' => $userId, 'space_id' => $spaceId, 'status' => 3])->execute();
}
foreach ([[$users['owner'], $users['friend']], [$users['friend'], $users['owner']], [$users['viewer'], $users['owner']]] as [$a, $b]) {
    $db->createCommand()->upsert('{{%user_friendship}}', ['user_id' => $a, 'friend_user_id' => $b, 'created_at' => gmdate('Y-m-d H:i:s')])->execute();
}
$db->createCommand()->update('{{%profile}}', ['firstname' => 'Legacy secret first', 'lastname' => 'Legacy secret last', 'title' => 'Legacy unconfirmed headline'], ['user_id' => $users['legacy']])->execute();
$module = $app->getModule('matcher-user-profile'); $service = $module->getProfileService(); $owner = $users['owner'];
$module->getIdentityService()->update($owner, 0, ['nickname' => 'Synthetic teammate']);
if ((new Query())->select('matcher_nickname')->from('{{%profile}}')->where(['user_id' => $owner])->scalar($db) !== 'Synthetic teammate') { throw new RuntimeException('Synthetic identity did not persist.'); }
$image = imagecreatetruecolor(64, 64); imagefill($image, 0, 0, imagecolorallocate($image, 30, 80, 120));
$temporary = tempnam($app->runtimePath, 'qr-'); imagepng($image, $temporary);
try { $qr = $module->getIdentityService()->upload($owner, 'contact_qr', $temporary); } finally { unlink($temporary); }
$operations = [
    ['key' => 'real_name', 'value' => 'Private Root Name', 'visibility' => 'private'],
    ['key' => 'headline', 'value' => 'Public collaboration headline', 'visibility' => 'authenticated'],
    ['key' => 'bio', 'value' => 'Friends-only biography marker', 'visibility' => 'friends'],
    ['key' => 'skill', 'value' => ['code' => 'backend', 'label' => 'Backend skill'], 'visibility' => 'friends'],
    ['key' => 'personality', 'value' => ['self_description' => 'Private planning style'], 'visibility' => 'private'],
    ['key' => 'project', 'value' => ['title' => 'Public root project', 'contribution' => 'Backend integration'], 'visibility' => 'authenticated'],
    ['key' => 'contact_wechat', 'value' => 'synthetic_wechat_root', 'visibility' => 'authenticated'],
    ['key' => 'contact_email', 'value' => 'synthetic-contact@example.invalid', 'visibility' => 'friends'],
    ['key' => 'contact_wechat_qr', 'value' => ['file_ref' => $qr['file_ref']], 'visibility' => 'authenticated'],
];
$draft = $service->startDraft($owner, $owner, ProfileScope::global(), 'manual', false);
$draft = $service->updateDraft($owner, $owner, ProfileScope::global(), $draft['id'], $draft['draft_version'], $operations);
$profile = $service->confirmDraft($owner, $owner, ProfileScope::global(), $draft['id'], $draft['draft_version'], $draft['base_revision'])['profile'];
$attributeIds = []; foreach ($profile['attributes'] as $attribute) { $attributeIds[$attribute['key']] = $attribute['attribute_id']; }
foreach ($spaces as $index => $spaceId) {
    $scope = ProfileScope::event($spaceId); $draft = $service->startDraft($owner, $owner, $scope, 'manual', false);
    $draft = $service->updateDraft($owner, $owner, $scope, $draft['id'], $draft['draft_version'], [['key' => 'event_goal', 'value' => ['free_text' => 'space-' . $index . '-root-goal']]]);
    $service->confirmDraft($owner, $owner, $scope, $draft['id'], $draft['draft_version'], $draft['base_revision']);
}
$post = new Post(['message' => 'Synthetic public author entry']);
$post->silentContentCreation = true; $post->content->setContainer(User::findOne($owner));
$post->content->created_by = $owner; $post->content->updated_by = $owner;
$post->content->visibility = Content::VISIBILITY_PUBLIC; $post->content->state = Content::STATE_PUBLISHED;
if (!$post->save(false)) { throw new RuntimeException('Synthetic public post failed.'); }
$db->createCommand()->update('{{%content}}', ['created_by' => $owner, 'updated_by' => $owner], ['id' => $post->content->id])->execute();
$fixture = ['users' => $users, 'spaces' => $spaces, 'attribute_ids' => $attributeIds, 'qr_ref' => $qr['file_ref'], 'post_id' => (int)$post->id, 'content_id' => (int)$post->content->id];
file_put_contents($file, json_encode($fixture, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR)); chmod($file, 0600);
echo json_encode($fixture, JSON_THROW_ON_ERROR), PHP_EOL;
