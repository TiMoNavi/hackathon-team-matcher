<?php
declare(strict_types=1);
require __DIR__ . '/s2_persistence_bootstrap.php';
use humhub\modules\matcherProfile\adapters\persistence\SqlProfileRepository;
use humhub\modules\matcherProfile\adapters\persistence\NativeProfileAccessPolicy;
use humhub\modules\matcherProfile\application\ProfileService;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\matcherProfile\domain\ProfileException;

$job = json_decode((string)fgets(STDIN), true, 512, JSON_THROW_ON_ERROR);
$repo = new SqlProfileRepository($db, static function (int $id): void {});
$service = new ProfileService($repo, new NativeProfileAccessPolicy($db, static fn(): bool => false));
try {
    $owner = (int)$job['owner'];
    if ($job['action'] === 'ensure') {
        $state = $repo->transaction(function () use ($repo, $owner) {
            echo "ready\n"; flush();
            $state = $repo->ensureState($owner, ProfileScope::global(), gmdate('Y-m-d H:i:s'));
            usleep(200000);
            return $state;
        });
        echo json_encode(['status' => 'ok', 'id' => $state['id']]);
    } elseif ($job['action'] === 'confirm') {
        echo "ready\n"; flush();
        $result = $service->confirmDraft($owner, $owner, ProfileScope::global(), $job['draft'], (int)$job['version'], (int)$job['base']);
        echo json_encode(['status' => 'ok', 'revision' => $result['confirmed_revision']]);
    } elseif ($job['action'] === 'timezone_writer') {
        $result = $repo->transaction(function () use ($repo, $service, $owner) {
            (new NativeProfileAccessPolicy(Yii::$app->db, static fn(): bool => false))->assertOwner($owner, $owner, ProfileScope::global());
            $state = $repo->ensureState($owner, ProfileScope::global(), gmdate('Y-m-d H:i:s'));
            echo "ready\n"; flush();
            if (trim((string)fgets(STDIN)) !== 'release') { throw new RuntimeException('Missing race release.'); }
            $profile = $service->getProfile($owner, $owner, ProfileScope::global());
            $operation = ['key' => 'timezone', 'value' => 'Pacific/Auckland'];
            foreach ($profile['attributes'] as $a) { if ($a['key'] === 'timezone') { $operation['attribute_id'] = $a['attribute_id']; } }
            $draft = $service->startDraft($owner, $owner, ProfileScope::global(), 'manual', false);
            $draft = $service->updateDraft($owner, $owner, ProfileScope::global(), $draft['id'], $draft['draft_version'], [$operation]);
            return $service->confirmDraft($owner, $owner, ProfileScope::global(), $draft['id'], $draft['draft_version'], (int)$state['revision']);
        });
        echo json_encode(['status' => 'ok', 'revision' => $result['confirmed_revision']]);
    } elseif ($job['action'] === 'timezone_reader') {
        $result = $repo->transaction(function () use ($repo, $service, $owner) {
            (new NativeProfileAccessPolicy(Yii::$app->db, static fn(): bool => false))->assertOwner($owner, $owner, ProfileScope::global());
            echo "ready\n"; flush();
            $repo->findState($owner, ProfileScope::global(), true);
            return $service->getProfile($owner, $owner, ProfileScope::global());
        });
        echo json_encode(['status' => 'ok', 'revision' => $result['revision'], 'timezone' => array_column($result['attributes'], 'value', 'key')['timezone'] ?? null]);
    } elseif ($job['action'] === 'remove_member') {
        $db->createCommand('SET SESSION innodb_lock_wait_timeout = 1')->execute();
        echo "ready\n"; flush();
        $db->createCommand()->update('space_membership', ['status' => 2], ['user_id' => $owner, 'space_id' => (int)$job['space']])->execute();
        echo json_encode(['status' => 'unexpected_write']);
    }
} catch (ProfileException $e) { echo json_encode(['status' => 'rejected', 'code' => $e->errorCode]); }
catch (Throwable $e) { echo json_encode(['status' => 'db_error', 'code' => $e instanceof yii\db\Exception ? ($e->errorInfo[1] ?? null) : null]); }
