<?php
declare(strict_types=1);
namespace humhub\modules\matcherIdeas\adapters\persistence;
use humhub\modules\matcherIdeas\domain\IdeaException;
use humhub\modules\matcherIdeas\domain\ports\IdeaRepository;
use yii\db\{Connection, Query, IntegrityException};

final class SqlIdeaRepository implements IdeaRepository
{
    public function __construct(private Connection $db) {}
    public function transaction(callable $work): mixed
    {
        $logging = $this->db->enableLogging; $profiling = $this->db->enableProfiling;
        $this->db->enableLogging = false; $this->db->enableProfiling = false;
        try { return $this->db->useMaster(fn(Connection $db): mixed => $db->noCache(fn(): mixed => $db->transaction($work))); }
        finally { $this->db->enableLogging = $logging; $this->db->enableProfiling = $profiling; }
    }
    public function idea(int $ideaId, bool $lock = false): ?array
    { return $this->one((new Query())->from(IdeaSchema::IDEA)->where(['id' => $ideaId]), $lock); }
    public function createIdea(int $ownerId, string $title, string $summary): array
    {
        $this->db->createCommand()->insert(IdeaSchema::IDEA, ['creator_id' => $ownerId, 'title' => $title, 'summary' => $summary, 'status' => 'active', 'version' => 1])->execute();
        return $this->idea((int)$this->db->getLastInsertID());
    }
    public function updateIdea(int $ideaId, int $expectedVersion, array $changes): array
    {
        $changes = array_intersect_key($changes, array_flip(['title', 'summary', 'status']));
        $changes['version'] = $expectedVersion + 1;
        $this->changed($this->db->createCommand()->update(IdeaSchema::IDEA, $changes, ['id' => $ideaId, 'version' => $expectedVersion])->execute(), $expectedVersion);
        return $this->idea($ideaId);
    }
    public function activity(int $activityId, bool $lock = false): ?array
    {
        // Lock the authoritative activity before reading the optional binding.
        $row = $this->one((new Query())->from(IdeaSchema::ACTIVITY)->where(['id' => $activityId]), $lock);
        if ($row === null) { return null; }
        $binding = $this->one((new Query())->from(IdeaSchema::BINDING)->where(['activity_id' => $activityId]), $lock);
        $row['message_id'] = $binding['message_id'] ?? null;
        return $row;
    }
    public function activityFor(int $ideaId, int $spaceId): ?array
    {
        $row = $this->one((new Query())->select('id')->from(IdeaSchema::ACTIVITY)->where(['idea_id' => $ideaId, 'space_id' => $spaceId]), true);
        return $row === null ? null : $this->activity($row['id']);
    }
    public function createActivity(int $ideaId, int $spaceId): array
    {
        try { $this->db->createCommand()->insert(IdeaSchema::ACTIVITY, ['idea_id' => $ideaId, 'space_id' => $spaceId, 'members_visible' => false, 'version' => 1])->execute(); }
        catch (IntegrityException $error) { throw new IdeaException('IDEA_ACTIVITY_EXISTS', 'This idea is already associated with the Space.', 409); }
        return $this->activity((int)$this->db->getLastInsertID());
    }
    public function updateActivity(int $activityId, int $expectedVersion, array $changes): array
    {
        $changes = array_intersect_key($changes, ['members_visible' => true, 'status' => true]);
        $changes['version'] = $expectedVersion + 1;
        $this->changed($this->db->createCommand()->update(IdeaSchema::ACTIVITY, $changes, ['id' => $activityId, 'version' => $expectedVersion])->execute(), $expectedVersion);
        return $this->activity($activityId);
    }
    public function bindingForMessage(int $messageId): ?array
    { return $this->one((new Query())->from(IdeaSchema::BINDING)->where(['message_id' => $messageId]), true); }
    public function bindMessage(int $activityId, int $messageId): void
    {
        try { $this->db->createCommand()->insert(IdeaSchema::BINDING, ['activity_id' => $activityId, 'message_id' => $messageId])->execute(); }
        catch (IntegrityException $error) { throw new IdeaException('IDEA_CONVERSATION_ALREADY_BOUND', 'A conversation binding cannot be reused.', 409); }
    }
    public function candidates(int $spaceId, int $afterId, int $limit): array
    {
        $query = (new Query())->select(['a.id', 'a.idea_id', 'a.space_id', 'a.members_visible', 'a.status', 'a.version', 'b.message_id', 'i.creator_id', 'i.title', 'i.summary', 'idea_version' => 'i.version'])
            ->from(['a' => IdeaSchema::ACTIVITY])->innerJoin(['i' => IdeaSchema::IDEA], '[[i.id]] = [[a.idea_id]]')
            ->innerJoin(['b' => IdeaSchema::BINDING], '[[b.activity_id]] = [[a.id]]')
            ->where(['a.space_id' => $spaceId, 'a.status' => 'published', 'i.status' => 'active'])->andWhere(['>', 'a.id', $afterId])->orderBy(['a.id' => SORT_ASC])->limit(max(1, min(200, $limit)));
        return array_map([$this, 'types'], $this->rows($query));
    }
    private function changed(int $affected, int $expectedVersion): void
    { if ($expectedVersion < 1 || $affected !== 1) { throw new IdeaException('IDEA_VERSION_CONFLICT', 'The record has changed.', 409); } }
    private function one(Query $query, bool $lock = false): ?array
    {
        $rows = $this->rows($query, $lock);
        return isset($rows[0]) ? $this->types($rows[0]) : null;
    }
    private function rows(Query $query, bool $lock = false): array
    {
        $query = clone $query; $query->noCache();
        $command = $query->createCommand($this->db);
        if ($this->db->driverName === 'mysql' && $this->db->getTransaction()?->isActive) {
            $params = $command->params;
            $command->setSql($command->getSql() . ($lock ? ' FOR UPDATE' : ' FOR SHARE'))->bindValues($params);
        }
        return $command->queryAll();
    }
    private function types(array $row): array
    {
        foreach (['id', 'creator_id', 'owner_id', 'idea_id', 'space_id', 'message_id', 'activity_id', 'version', 'idea_version', 'base_version', 'confirmed_idea_id'] as $key) { if (isset($row[$key])) { $row[$key] = (int)$row[$key]; } }
        if (isset($row['members_visible'])) { $row['members_visible'] = (bool)$row['members_visible']; }
        if (isset($row['fields_json'])) { $row['fields'] = json_decode($row['fields_json'], true, 8, JSON_THROW_ON_ERROR); unset($row['fields_json']); }
        return $row;
    }
    public function ownedIdeas(int $ownerId, int $limit): array
    { return array_map([$this, 'types'], $this->rows((new Query())->from(IdeaSchema::IDEA)->where(['creator_id' => $ownerId])->orderBy(['id' => SORT_ASC])->limit($limit))); }
    public function draft(int $draftId, bool $lock = false): ?array
    { return $this->one((new Query())->from(IdeaSchema::DRAFT)->where(['id' => $draftId]), $lock); }
    public function createDraft(int $ownerId, ?int $ideaId, ?int $baseVersion, array $fields, string $rawText): array
    {
        $this->db->createCommand()->insert(IdeaSchema::DRAFT, ['owner_id' => $ownerId, 'idea_id' => $ideaId, 'base_version' => $baseVersion,
            'fields_json' => json_encode($fields, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), 'raw_text' => $rawText, 'status' => 'editing', 'version' => 1])->execute();
        return $this->draft((int)$this->db->getLastInsertID());
    }
    public function updateDraft(int $draftId, int $expectedVersion, array $changes): array
    {
        $changes = array_intersect_key($changes, array_flip(['fields', 'raw_text', 'status', 'confirmed_idea_id']));
        if (array_key_exists('fields', $changes)) { $changes['fields_json'] = json_encode($changes['fields'], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE); unset($changes['fields']); }
        $changes['version'] = $expectedVersion + 1;
        $this->changed($this->db->createCommand()->update(IdeaSchema::DRAFT, $changes, ['id' => $draftId, 'version' => $expectedVersion])->execute(), $expectedVersion);
        return $this->draft($draftId);
    }
}
