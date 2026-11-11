<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\persistence;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\matcherProfile\domain\ports\ProfileAccessPolicy;
use humhub\modules\admin\permissions\ManageUsers;
use humhub\modules\user\components\PermissionManager;
use humhub\modules\user\models\User;
use humhub\modules\space\models\Space;
use humhub\modules\space\models\Membership;
use humhub\modules\content\models\ContentContainerBlockedUsers;
use Yii;
use yii\db\Connection;
use yii\db\Query;

/** Authorization is re-read; a visible/public Space is not proof of membership. */
final class NativeProfileAccessPolicy implements ProfileAccessPolicy
{
    private $maintenance;
    public function __construct(private Connection $db, ?callable $maintenance = null)
    {
        $this->maintenance = $maintenance ?? static fn(): bool => (bool)Yii::$app->getModule('matcher-user-profile')?->isInMaintenance();
    }
    public function assertOwner(int $actorId, int $ownerId, ProfileScope $scope): void
    {
        $this->active($actorId); $this->active($ownerId);
        if ($actorId !== $ownerId) { $this->denied('Only the owner may edit or read private profile state.'); }
        if ($scope->spaceId !== null) { $this->member($ownerId, $scope->spaceId); }
    }
    public function assertCanRead(int $actorId, int $ownerId, ProfileScope $scope, ?int $currentSpaceId): void
    {
        if ($actorId === $ownerId) { $this->assertOwner($actorId, $ownerId, $scope); return; }
        $actor = $this->active($actorId); $owner = $this->active($ownerId);
        if ($currentSpaceId === null || ($scope->spaceId !== null && $scope->spaceId !== $currentSpaceId)) { $this->denied('A current Space context is required.'); }
        $this->member($actorId, $currentSpaceId); $this->member($ownerId, $currentSpaceId);
        $blocked = (new Query())->from(ContentContainerBlockedUsers::tableName())->where(['or', ['contentcontainer_id' => $actor['contentcontainer_id'], 'user_id' => $ownerId], ['contentcontainer_id' => $owner['contentcontainer_id'], 'user_id' => $actorId]])->exists($this->db);
        if ($blocked) { $this->denied('This profile is unavailable.'); }
    }
    public function assertAdministrator(int $actorId, int $ownerId, ProfileScope $scope): void
    {
        $this->active($actorId); $this->active($ownerId);
        $actor = User::findOne($actorId); $owner = User::findOne($ownerId);
        $systemAdmin = $actor !== null && $actor->isSystemAdmin(false);
        if (!$systemAdmin && !($actor !== null && (new PermissionManager(['subject' => $actor]))->can(ManageUsers::class, [], false))) { $this->denied('User administration permission is required.'); }
        if (!$systemAdmin && $owner?->isSystemAdmin(false)) { $this->denied('Only a system administrator may propose changes for this account.'); }
        if ($scope->spaceId !== null) { $this->member($ownerId, $scope->spaceId); }
    }
    public function assertWritable(): void
    {
        if (($this->maintenance)()) { throw new ProfileException('PROFILE_MAINTENANCE', 'Profile changes are temporarily paused.', 503); }
    }
    private function active(int $id): array
    {
        $row = $this->read((new Query())->select(['id', 'contentcontainer_id'])->from(User::tableName())->where(['id' => $id, 'status' => User::STATUS_ENABLED]), false);
        if ($id <= 0 || $row === null) { throw new ProfileException('PROFILE_ACCESS_DENIED', 'An active signed-in account is required.', $id <= 0 ? 401 : 403); }
        return $row;
    }
    private function member(int $ownerId, int $spaceId): void
    {
        $space = $this->read((new Query())->select(['id'])->from(Space::tableName())->where(['id' => $spaceId, 'status' => Space::STATUS_ENABLED]));
        $member = $this->read((new Query())->select(['id'])->from(Membership::tableName())->where(['user_id' => $ownerId, 'space_id' => $spaceId, 'status' => Membership::STATUS_MEMBER]));
        if ($space === null || $member === null) { $this->denied('Formal membership of the current Space is required.'); }
    }
    private function read(Query $query, bool $lock = true): ?array
    {
        $command = $query->createCommand($this->db);
        if ($lock && $this->db->getTransaction()?->isActive) { $params = $command->params; $command->setSql($command->getSql() . ' FOR SHARE')->bindValues($params); }
        return $command->queryOne() ?: null;
    }
    private function denied(string $message): never { throw new ProfileException('PROFILE_ACCESS_DENIED', $message, 403); }
}
