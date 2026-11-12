<?php
declare(strict_types=1);
namespace humhub\modules\matcherAuth\adapters\native;

use humhub\modules\matcherAuth\domain\AuthException;
use humhub\modules\matcherAuth\domain\GithubImportStatus;
use humhub\modules\matcherProfile\domain\ProfileException;
use Yii;
use yii\db\Query;

/** Owner-only projection. Source authorization remains in the existing P1 read use case. */
final class GithubImportStatusReader
{
    public function read(int $ownerId): array
    {
        $this->assertOwner($ownerId);
        $intent = $this->intent($ownerId);
        if ($intent === false) { return GithubImportStatus::receipt(null, [], false); }
        $subjects = $this->subjects($ownerId);
        $profile = Yii::$app->getModule('matcher-user-profile');
        $importer = Yii::$app->getModule('matcher-github-import');
        $provider = Yii::$app->getModule('auth-github');
        $available = $profile !== null && $profile->isEnabled && $importer !== null && $importer->isEnabled
            && $provider !== null && $provider->isEnabled;
        $status = GithubImportStatus::receipt($intent, $subjects, $available);
        if ($status['source_id'] === null) { return $status; }
        try {
            // Compact existing use case: no snapshot, reader, model or refresh is loaded.
            for ($read = 0; $read < 2; $read++) {
                $source = $profile->getSourceService()->getProgress($ownerId, $status['source_id']);
                if (($source['kind'] ?? null) !== 'github' || ($source['status'] ?? null) === 'deleted'
                    || ($source['progress']['state'] ?? null) === 'revoked') {
                    return ['state' => 'revoked', 'source_id' => null];
                }
                $this->assertOwner($ownerId);
                // A source read may overlap unlinking, deletion, or module shutdown.
                // Bounded fresh reads reject observed changes; this is not a cross-domain transaction.
                $freshIntent = $this->intent($ownerId); $freshSubjects = $this->subjects($ownerId);
                $freshAvailable = $profile->isEnabled && $importer->isEnabled && $provider->isEnabled;
                $fresh = GithubImportStatus::receipt($freshIntent === false ? null : $freshIntent, $freshSubjects, $freshAvailable);
                if ($fresh['state'] === 'revoked') { return $fresh; }
                if (!$freshAvailable || $freshIntent !== $intent || $freshSubjects !== $subjects || $fresh !== $status) {
                    return ['state' => 'unavailable', 'source_id' => null];
                }
            }
        } catch (ProfileException $error) {
            return ['state' => $error->errorCode === 'SOURCE_NOT_FOUND' ? 'revoked' : 'unavailable', 'source_id' => null];
        }
        return $status;
    }

    private function assertOwner(int $ownerId): void
    {
        if (Yii::$app->user->isGuest || (int)Yii::$app->user->id !== $ownerId) {
            throw new AuthException('AUTHENTICATION_REQUIRED', 'Sign in to read your import status.', 401);
        }
    }
    private function intent(int $ownerId): array|false
    {
        return Yii::$app->db->useMaster(fn($db) => (new Query())->select(['provider_subject', 'state', 'source_id'])
            ->from('{{%matcher_auth_import}}')->where(['owner_id' => $ownerId])->noCache()->one($db));
    }
    private function subjects(int $ownerId): array
    {
        return Yii::$app->db->useMaster(fn($db) => (new Query())->select('source_id')->from('{{%user_auth}}')
            ->where(['source' => 'github', 'user_id' => $ownerId])->orderBy(['source_id' => SORT_ASC])->limit(2)->noCache()->column($db));
    }
}
