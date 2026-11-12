<?php
declare(strict_types=1);
namespace humhub\modules\matcherAuth\adapters\native;

use humhub\modules\matcherAuth\Module;
use Yii;
use yii\db\Query;

final class GithubImportCoordinator
{
    public function __construct(private Module $module) {}
    public function schedule(int $ownerId, string $subject, string $reason): void
    {
        if (!in_array($reason, ['first_registration', 'explicit_bind'], true)) { throw new \LogicException('Unsupported import authorization.'); }
        $this->module->store()->db->createCommand()->upsert('{{%matcher_auth_import}}', [
            'owner_id' => $ownerId, 'provider_subject' => $subject, 'reason' => $reason, 'state' => 'pending',
            'request_key' => 'matcher-auth-github-' . $ownerId . '-' . bin2hex(random_bytes(16)), 'created_at' => time(),
        ], false)->execute();
    }
    /** Only a durable, unattempted user-authorized receipt can start this one public read. */
    public function attemptPending(int $ownerId): void
    {
        if (Yii::$app->user->isGuest || (int)Yii::$app->user->id !== $ownerId) { return; }
        try {
            $intent = $this->module->store()->transaction(function () use ($ownerId): ?array {
                $this->module->store()->lock('github-import:' . $ownerId);
                $row = $this->module->store()->current('{{%matcher_auth_import}}', 'owner_id', (string)$ownerId);
                if ($row === null || $row['state'] !== 'pending') { return null; }
                $ids = (new Query())->select('source_id')->from('{{%user_auth}}')->where(['source' => 'github', 'user_id' => $ownerId])->column($this->module->store()->db);
                if (count($ids) !== 1 || (string)$ids[0] !== $row['provider_subject']) {
                    $this->module->store()->db->createCommand()->update('{{%matcher_auth_import}}', ['state' => 'revoked', 'attempted_at' => time()], ['owner_id' => $ownerId])->execute();
                    return null;
                }
                $changed = $this->module->store()->db->createCommand()->update('{{%matcher_auth_import}}', ['state' => 'running', 'attempted_at' => time()], ['owner_id' => $ownerId, 'state' => 'pending'])->execute();
                return $changed === 1 ? $row : null;
            });
            if ($intent === null) { return; }
            $profile = Yii::$app->getModule('matcher-user-profile');
            $repository = $profile->getSourceRepository();
            // The existing per-owner source lock spans this bounded first import so a simultaneous
            // manual import/delete cannot slip between the history check and source registration.
            // Catch inside the transaction: existing source/job failure records must remain committed.
            $outcome = $profile->getProfileWorkflow()->transaction($ownerId, null, fn(): array => $repository->transaction(function () use ($ownerId, $intent, $profile, $repository): array {
                if ($repository->hasSourceHistory($ownerId, 'github')) { return ['state' => 'skipped_existing', 'source_id' => null]; }
                try {
                    $source = $profile->getSourceService()->import($ownerId, 'github', [], $intent['request_key']);
                    return ['state' => match ($source['status'] ?? null) { 'ready' => 'succeeded', 'deleted' => 'revoked', default => 'failed' },
                        'source_id' => $source['id'] ?? $source['source_id'] ?? null];
                } catch (\Throwable) { return ['state' => 'failed', 'source_id' => null]; }
            }));
            $this->module->store()->db->createCommand()->update('{{%matcher_auth_import}}', $outcome, ['owner_id' => $ownerId, 'state' => 'running'])->execute();
        } catch (\Throwable) {
            // Authentication is already successful. Never roll it back or retry this import on login.
            try { $this->module->store()->db->createCommand()->update('{{%matcher_auth_import}}', ['state' => 'failed'], ['owner_id' => $ownerId, 'state' => ['pending', 'running']])->execute(); }
            catch (\Throwable) { /* No credential, source text or exception message is logged. */ }
        }
    }
}
