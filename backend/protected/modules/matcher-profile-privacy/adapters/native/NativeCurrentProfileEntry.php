<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\adapters\native;
use humhub\modules\matcherPrivacy\domain\ports\CurrentProfileEntry;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\user\models\User;
use yii\db\{Connection, Query};

/** Adapter reuses the existing server-owned current-event capability without trusting request grants. */
final class NativeCurrentProfileEntry implements CurrentProfileEntry
{
    private \Closure $currentEvent;
    private \Closure $identities;
    private NativeProfileRelations $relations;
    public function __construct(private Connection $db, callable $currentEvent, ?callable $identities = null)
    {
        $this->currentEvent = \Closure::fromCallable($currentEvent); $this->relations = new NativeProfileRelations($db);
        $reader = new \humhub\modules\matcherProfile\application\ConfirmedIdentityBatchReader(new \humhub\modules\matcherProfile\adapters\identity\SqlConfirmedIdentityBatchSource($db));
        $this->identities = $identities === null ? $reader->read(...) : \Closure::fromCallable($identities);
    }
    public function resolve(int $viewerId, int $ownerId, int $spaceId): array
    {
        if ($this->db->getTransaction()?->isActive) { throw new ProfileException('PROFILE_ENTRY_UNAVAILABLE', 'Current profile entry requires fresh authorization reads.', 503); }
        $logging = $this->db->enableLogging; $profiling = $this->db->enableProfiling;
        $this->db->enableLogging = false; $this->db->enableProfiling = false;
        try { return $this->db->useMaster(fn(): array => $this->db->noCache(fn(): array => $this->resolveCurrent($viewerId, $ownerId, $spaceId))); }
        catch (ProfileException $error) { throw $error; }
        catch (\Throwable) { throw new ProfileException('PROFILE_ENTRY_UNAVAILABLE', 'The current activity profile entry is unavailable.', 503); }
        finally { $this->db->enableLogging = $logging; $this->db->enableProfiling = $profiling; }
    }
    private function resolveCurrent(int $viewerId, int $ownerId, int $spaceId): array
    {
        try { $context = ($this->currentEvent)($viewerId, $spaceId); }
        catch (ProfileException $error) { throw $error; }
        catch (\Throwable $error) {
            $status = match ($error->reason ?? null) { 'authentication_required' => 401, 'dependency_unavailable', 'authorization_transaction_unsupported' => 503, default => 403 };
            throw new ProfileException($status === 503 ? 'PROFILE_ENTRY_UNAVAILABLE' : 'PROFILE_ACCESS_DENIED', 'The current activity profile entry is unavailable.', $status);
        }
        $this->relations->assertActive($viewerId); $this->relations->assertActive($ownerId);
        if (!$this->relations->isSpaceMember($viewerId, $spaceId) || !$this->relations->isSpaceMember($ownerId, $spaceId) || $this->relations->isBlocked($viewerId, $ownerId)) { $this->denied(); }
        $user = (new Query())->select(['id', 'status', 'visibility', 'updated_at'])->from('{{%user}}')->where(['id' => $ownerId])->one($this->db);
        if ($user === false || ($viewerId !== $ownerId && !in_array((int)$user['visibility'], [User::VISIBILITY_REGISTERED_ONLY, User::VISIBILITY_ALL], true))) { $this->denied(); }
        $discovery = null; $identity = null;
        if ($viewerId !== $ownerId) {
            $discovery = (new Query())->select(['discoverable', 'version'])->from('{{%matcher_recommendation_discovery_settings}}')->where(['owner_id' => $ownerId, 'space_id' => $spaceId])->one($this->db);
            if ($discovery === false || (int)$discovery['discoverable'] !== 1) { $this->denied(); }
            // Match the real S7.1 card entrance. Never substitute username or real name.
            $identities = ($this->identities)([$ownerId]);
            if (!is_array($identities)) { throw new ProfileException('PROFILE_ENTRY_UNAVAILABLE', 'Confirmed identity source is unavailable.', 503); }
            $identity = $identities[$ownerId] ?? null;
            if ($identity === null) { $this->denied(); }
        }
        $members = (new Query())->select(['id', 'user_id', 'status', 'group_id', 'created_at', 'updated_at'])->from('{{%space_membership}}')->where(['space_id' => $spaceId, 'user_id' => array_values(array_unique([$viewerId, $ownerId]))])->orderBy('user_id')->all($this->db);
        $friend = $viewerId !== $ownerId && $this->relations->areFriends($viewerId, $ownerId);
        return ['version' => hash('sha256', json_encode([$context, $user, $discovery, $identity, $members, $friend], JSON_THROW_ON_ERROR)), 'friend' => $friend];
    }
    private function denied(): never { throw new ProfileException('PROFILE_ACCESS_DENIED', 'This person is unavailable through the current activity entry.', 403); }
}
