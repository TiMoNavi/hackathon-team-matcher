<?php
declare(strict_types=1);
use humhub\modules\matcherProfile\application\IdentityService;
use humhub\modules\matcherProfile\adapters\media\LocalProfileMediaStore;
use humhub\modules\matcherProfile\adapters\media\SqlIdentityStore;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\user\models\User;

$app = require __DIR__ . '/s2_http_bootstrap.php';
$owner = (int)($argv[2] ?? 0);
$user = User::findOne($owner);
if (!$user || !str_starts_with((string)$user->username, 's2_http_')) { throw new RuntimeException('A synthetic s2_http_ user is required.'); }
$module = $app->getModule('matcher-user-profile');
$repo = $module->getProfileRepository();
$store = new SqlIdentityStore($app->db, $repo);
$files = new LocalProfileMediaStore($module->mediaStoragePath);
$service = $module->getIdentityService();
$checks = [];
$check = static function (bool $ok, string $label) use (&$checks): void { if (!$ok) { throw new RuntimeException('Failed: ' . $label); } $checks[] = $label; };
$reject = static function (callable $operation, string $code, string $label) use ($check): void {
    try { $operation(); } catch (ProfileException $error) { $check($error->errorCode === $code, $label); return; }
    $check(false, $label);
};
$image = imagecreatetruecolor(1700, 800); imagefill($image, 0, 0, imagecolorallocate($image, 20, 170, 90));
$temporary = tempnam($app->runtimePath, 'media-test-'); imagepng($image, $temporary);
$before = $service->getIdentity($owner);
$profileBefore = $module->getProfileService()->getProfile($owner, $owner, ProfileScope::global());
try {
    $candidate = $service->upload($owner, 'avatar', $temporary);
    $metadata = $store->media($candidate['file_ref']);
    $check($metadata !== null && $metadata['width'] === 1024 && $metadata['height'] < 1024, 'bounded_avatar_master');
    $thumbnail = $files->path($metadata, 'thumbnail'); $thumbnailBytes = file_get_contents($thumbnail);
    $dimensions = getimagesize($thumbnail); $check(max($dimensions[0], $dimensions[1]) === 256, 'bounded_avatar_thumbnail');
    unlink($thumbnail);
    $reject(fn() => $service->update($owner, $before['identity_version'], ['avatar_ref' => $candidate['file_ref']]), 'MEDIA_UNAVAILABLE', 'missing_thumbnail_rejects_confirmation');
    $check($service->getIdentity($owner) === $before, 'failed_media_confirmation_retains_identity');
    file_put_contents($thumbnail, $thumbnailBytes); chmod($thumbnail, 0600);
    $confirmed = $service->update($owner, $before['identity_version'], ['avatar_ref' => $candidate['file_ref']]);
    $check($confirmed['identity_version'] === $before['identity_version'] + 1, 'restored_candidate_can_confirm');
    $main = $files->path($metadata, 'main'); $mainBytes = file_get_contents($main);
    file_put_contents($main, 'corrupt-image');
    $reject(fn() => $service->readMedia($owner, $candidate['file_ref']), 'MEDIA_UNAVAILABLE', 'corrupt_resource_fails_closed');
    file_put_contents($main, $mainBytes); chmod($main, 0600);
    $check($service->readMedia($owner, $candidate['file_ref'])['path'] === $main, 'restored_media_recovers_without_identity_rewrite');
    $freshUser = User::findOne($owner);
    $check(str_contains(get_class($freshUser->image), 'ProtectedProfileImage'), 'native_avatar_uses_confirmed_projection');
    $check(str_contains($freshUser->image->getUrl(), $candidate['file_ref']), 'native_avatar_url_points_to_confirmed_resource');
    $check($service->getIdentity($owner)['identity_version'] === $confirmed['identity_version'], 'projection_has_no_second_identity_increment');
    $profileAfter = $module->getProfileService()->getProfile($owner, $owner, ProfileScope::global());
    $check($profileAfter['revision'] === $profileBefore['revision'], 'identity_does_not_advance_profile_revision');
    $check($profileAfter['attributes'] === $profileBefore['attributes'], 'identity_does_not_reconfirm_profile_attributes');
    $invalidStorage = $app->runtimePath . '/media-storage-file'; file_put_contents($invalidStorage, 'not-a-directory');
    $badService = new IdentityService($store, $module->getAccessPolicy(), new LocalProfileMediaStore($invalidStorage));
    $reject(fn() => $badService->upload($owner, 'avatar', $temporary), 'MEDIA_UNAVAILABLE', 'storage_failure_is_explicit');
    @unlink($invalidStorage);
    $check($service->getIdentity($owner)['identity_version'] === $confirmed['identity_version'], 'storage_failure_does_not_mutate_identity');
    $reset = $service->update($owner, $confirmed['identity_version'], ['avatar_ref' => null]);
    $check($reset['avatar_ref'] === null, 'avatar_reset_is_versioned');
    $key = bin2hex(random_bytes(12)); $route = 'media-upload:avatar';
    $hash = hash('sha256', $owner . "\0" . $route . "\0" . $key);
    $receiptId = substr($hash, 0, 8) . '-' . substr($hash, 8, 4) . '-4' . substr($hash, 13, 3) . '-a' . substr($hash, 17, 3) . '-' . substr($hash, 20, 12);
    $attempted = null;
        try {
            $module->getIdempotencyGuard()->run($owner, $route, $key, ['test' => 'rollback'], static fn() => null,
                function () use ($service, $owner, $temporary, $receiptId, $app, &$attempted): array {
                    $attempted = $service->upload($owner, 'avatar', $temporary);
                    // Cause a real unique-key failure at receipt insertion, without DDL or elevated privileges.
                    $collision = (new yii\db\Query())->from('{{%matcher_profile_draft}}')->where(['id' => substr($attempted['file_ref'], 4)])->one($app->db);
                    $collision['id'] = $receiptId;
                    $collision['fields_json'] = new yii\db\JsonExpression(is_array($collision['fields_json']) ? $collision['fields_json'] : json_decode($collision['fields_json'], true, 32, JSON_THROW_ON_ERROR));
                    $app->db->createCommand()->insert('{{%matcher_profile_draft}}', $collision)->execute();
                    return $attempted;
                },
                null, fn(array $receipt) => $service->discardRolledBackUpload($receipt['file_ref']));
            $check(false, 'receipt_failure_rolls_back');
        } catch (yii\db\Exception) { $check($attempted !== null, 'receipt_failure_rolls_back'); }
        $check($store->media($attempted['file_ref']) === null, 'failed_receipt_does_not_retain_candidate_row');
        $check(!is_dir($module->mediaStoragePath . '/' . substr($attempted['file_ref'], 4)), 'failed_receipt_cleans_staged_private_files');
    echo json_encode(['passed' => count($checks), 'checks' => $checks], JSON_THROW_ON_ERROR), PHP_EOL;
} finally { @unlink($temporary); }
