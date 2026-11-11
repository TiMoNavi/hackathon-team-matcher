<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\persistence;

use humhub\modules\matcherProfile\domain\ports\ProfileWorkflow;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\matcherProfile\Module;
use yii\db\Connection;
use yii\db\Query;

/** Adapter to the existing ordinary-profile transaction and permission boundary. */
final class NativeProfileWorkflow implements ProfileWorkflow
{
    public function __construct(private Module $profilesModule, private Connection $db) {}
    public function transaction(int $ownerId, ?int $spaceId, callable $callback, bool $writable = true): mixed
    {
        $access = $this->profilesModule->getAccessPolicy();
        if ($writable) { $access->assertWritable(); }
        $access->assertOwner($ownerId, $ownerId, ProfileScope::global());
        return $this->profilesModule->getProfileRepository()->transaction(function () use ($ownerId, $spaceId, $callback, $writable, $access): mixed {
            $now = gmdate('Y-m-d H:i:s');
            $this->profilesModule->getProfileRepository()->ensureState($ownerId, ProfileScope::global(), $now);
            if ($spaceId !== null) {
                // Existence preflight avoids FK errors for a forged Space; the live
                // membership and privacy checks happen again after both state locks.
                if (!(new Query())->from('{{%space}}')->where(['id' => $spaceId])->exists($this->db)) { throw new ProfileException('PROFILE_ACCESS_DENIED', 'The current Space is unavailable.', 403); }
                $this->profilesModule->getProfileRepository()->ensureState($ownerId, ProfileScope::event($spaceId), $now);
            }
            if ($writable) { $access->assertWritable(); }
            $this->profiles($ownerId, $spaceId);
            return $callback();
        });
    }
    public function profiles(int $ownerId, ?int $spaceId): array
    {
        $service = $this->profilesModule->getProfileService();
        return ['global' => $service->getProfile($ownerId, $ownerId, ProfileScope::global()), 'space' => $spaceId === null ? null : $service->getProfile($ownerId, $ownerId, ProfileScope::event($spaceId))];
    }
    public function createDraft(int $ownerId, ?int $spaceId): array { return $this->profilesModule->getProfileService()->startDraft($ownerId, $ownerId, $this->scope($spaceId), 'onboarding', false); }
    public function getDraft(int $ownerId, ?int $spaceId, string $id): array { return $this->profilesModule->getProfileService()->getDraft($ownerId, $ownerId, $this->scope($spaceId), $id); }
    public function updateDraft(int $ownerId, ?int $spaceId, string $id, int $expectedVersion, array $fields): array { return $this->profilesModule->getProfileService()->updateDraft($ownerId, $ownerId, $this->scope($spaceId), $id, $expectedVersion, $fields); }
    public function confirmDraft(int $ownerId, ?int $spaceId, string $id, int $expectedVersion, int $expectedRevision, ?array $attributeIds = null): array { return $this->profilesModule->getProfileService()->confirmDraft($ownerId, $ownerId, $this->scope($spaceId), $id, $expectedVersion, $expectedRevision, $attributeIds); }
    private function scope(?int $spaceId): ProfileScope { return $spaceId === null ? ProfileScope::global() : ProfileScope::event($spaceId); }
}
