<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\adapters\native;
use humhub\modules\matcherPrivacy\domain\ports\RelationCandidateSource;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\space\models\{Membership, Space};
use yii\db\{Connection, Query};

final class NativeRelationCandidateSource implements RelationCandidateSource
{
    private \Closure $ideas;
    private NativeProfileRelations $relations;
    public function __construct(private Connection $db, callable $ideas, private bool $defaultHideMembers = false)
    { $this->ideas = \Closure::fromCallable($ideas); $this->relations = new NativeProfileRelations($db); }
    public function readCandidates(int $viewerId, int $ownerId, int $spaceId, string $kind): array
    {
        if ($this->db->getTransaction()?->isActive) { throw new ProfileException('RELATION_SOURCE_UNAVAILABLE', 'Relation reads require current object authorization.', 503); }
        $logging = $this->db->enableLogging; $profiling = $this->db->enableProfiling;
        $this->db->enableLogging = false; $this->db->enableProfiling = false;
        try { return $this->db->useMaster(fn(): array => $this->db->noCache(fn(): array => $this->readCurrent($viewerId, $ownerId, $spaceId, $kind))); }
        catch (ProfileException $error) { throw $error; }
        catch (\Throwable) { throw new ProfileException('RELATION_SOURCE_UNAVAILABLE', 'The relation source is unavailable.', 503); }
        finally { $this->db->enableLogging = $logging; $this->db->enableProfiling = $profiling; }
    }
    private function readCurrent(int $viewerId, int $ownerId, int $spaceId, string $kind): array
    {
        $this->relations->assertActive($viewerId); $this->relations->assertActive($ownerId);
        if (!$this->relations->isSpaceMember($viewerId, $spaceId) || !$this->relations->isSpaceMember($ownerId, $spaceId) || $this->relations->isBlocked($viewerId, $ownerId)) { throw new ProfileException('PROFILE_ACCESS_DENIED', 'Current Space membership is required.', 403); }
        if ($kind === 'idea_groups') {
            try {
                $source = ($this->ideas)();
                if (!is_object($source) || !is_callable([$source, 'readCandidates'])) { throw new \RuntimeException(); }
                $items = $source->readCandidates($viewerId, $ownerId, $spaceId);
                if (!is_array($items)) { throw new \RuntimeException(); }
                return $items;
            } catch (ProfileException $error) { throw $error; }
            catch (\Throwable) { throw new ProfileException('RELATION_SOURCE_UNAVAILABLE', 'The optional ideas relation source is unavailable.', 503); }
        }
        if ($kind !== 'activities') { throw new ProfileException('INVALID_RELATION_KIND', 'Use activities or idea_groups.'); }
        $row = (new Query())->select(['s.id', 's.guid', 's.name', 's.description', 's.contentcontainer_id', 's.updated_at', 'membership_id' => 'm.id', 'm.group_id', 'membership_updated_at' => 'm.updated_at'])
            ->from(['s' => '{{%space}}'])->innerJoin(['m' => '{{%space_membership}}'], '[[m.space_id]] = [[s.id]]')
            ->where(['s.id' => $spaceId, 's.status' => Space::STATUS_ENABLED, 'm.user_id' => $ownerId, 'm.status' => Membership::STATUS_MEMBER])->one($this->db);
        if ($row === false) { return []; }
        $hide = (new Query())->select('value')->from('{{%contentcontainer_setting}}')->where(['module_id' => 'space', 'contentcontainer_id' => $row['contentcontainer_id'], 'name' => 'hideMembers'])->scalar($this->db);
        if ($hide === false) { $hide = (new Query())->select('value')->from('{{%setting}}')->where(['module_id' => 'space', 'name' => 'defaultHideMembers'])->scalar($this->db); }
        $hide = $hide === false ? $this->defaultHideMembers : in_array((string)$hide, ['1', 'true'], true);
        if ($hide) { return []; }
        return [['kind' => 'activity', 'id' => (string)$spaceId, 'title' => $row['name'], 'summary' => $row['description'] ?: null, 'href' => '/s/' . rawurlencode($row['guid']) . '/', 'event_id' => (string)$spaceId, 'membership_role' => (string)$row['group_id'], 'version' => hash('sha256', json_encode($row, JSON_THROW_ON_ERROR))]];
    }
}
