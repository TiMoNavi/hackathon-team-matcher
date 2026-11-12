<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\composition;

use humhub\modules\matcherRecommendation\Module;
use humhub\modules\matcherRecommendation\adapters\analysis\{CooperationHttpView, SqlSelfSelectionStore};
use humhub\modules\matcherRecommendation\adapters\native\YiiActorSessionSource;
use humhub\modules\matcherRecommendation\adapters\profile\{P1FieldCatalogAdapter, P1CooperationPurposePolicy, P1CooperationProjectionReader, P1SelfAnalysisProfileReader, P1SelectedSelfProjectionReader};
use humhub\modules\matcherRecommendation\application\analysis\{AnalyzeCooperation, ManageSelfAnalysisSelection};
use humhub\modules\matcherRecommendation\contracts\ProjectionVersions;
use humhub\modules\matcherRecommendation\contracts\analysis\{CooperationAnalysisException, CooperationAnalysisRequest};
use humhub\modules\matcherRecommendation\domain\config\{Fingerprint, PolicyValidator};
use Yii;

/** Production composition of existing read boundaries; no model, ranking default or runtime DDL. */
final class NativeCooperationFactory
{
    public function __construct(private readonly Module $module) {}

    public function selection(int $viewerId, int $spaceId): array
    {
        $parts = $this->parts();
        return self::selectionView($spaceId, $parts['manager']->read($viewerId, $spaceId));
    }
    public function replace(int $viewerId, int $spaceId, array $ids, int $expectedVersion, array $expectedContext): array
    {
        $parts = $this->parts();
        $context = $this->expectedContext($viewerId, $spaceId, $expectedContext);
        $saved = $parts['manager']->replace($viewerId, $spaceId, $ids, $expectedVersion, $context);
        $current = $parts['manager']->read($viewerId, $spaceId);
        if ($current['selection_version'] !== $saved->selectionVersion) { throw new CooperationAnalysisException('selection_unavailable'); }
        $parts['events']->assertCurrent($context);
        return self::selectionView($spaceId, $current);
    }
    public function analyze(int $viewerId, int $spaceId, int $candidateId, int $selectionVersion, array $expectedCandidate, array $expectedContext): array
    {
        if ($candidateId === $viewerId) { throw new CooperationAnalysisException('invalid_request'); }
        $parts = $this->parts(); $events = $parts['events'];
        $context = $this->expectedContext($viewerId, $spaceId, $expectedContext);
        $selection = $parts['manager']->current($viewerId, $spaceId, $selectionVersion);
        // The person must also remain an eligible ordinary discovery card. Client versions
        // are optimistic preconditions, never a permission or a replacement for the P8 read.
        $ordinary = $this->module->getOrdinaryDiscoveryService();
        self::assertOrdinarySnapshot($ordinary->detail($viewerId, $spaceId, $candidateId), $expectedCandidate);
        $versions = new ProjectionVersions(['global' => $expectedCandidate['global'], 'space:' . $spaceId => $expectedCandidate['space']],
            $parts['mapping']->schemaVersion,
            (new P1CooperationPurposePolicy())->projectionPolicyVersion($expectedCandidate['privacy_policy_version'], $parts['mapping'], $parts['bindings']),
            $expectedCandidate['identity_version']);
        $result = $parts['analyzer']->execute($viewerId, new CooperationAnalysisRequest($context, (string)$candidateId,
            $versions, $selection, $parts['mapping']->fingerprint()));
        self::assertOrdinarySnapshot($ordinary->detail($viewerId, $spaceId, $candidateId), $expectedCandidate);
        $freshSelection = $parts['manager']->current($viewerId, $spaceId, $selectionVersion);
        if (Fingerprint::of($selection) !== Fingerprint::of($freshSelection)) { throw new CooperationAnalysisException('selection_unavailable'); }
        $events->assertCurrent($context);
        return CooperationHttpView::analysis($result, $selectionVersion);
    }

    private function expectedContext(int $viewerId, int $spaceId, array $expected): \humhub\modules\matcherRecommendation\contracts\CurrentEventContext
    {
        $events = $this->module->getCurrentEventAccess();
        $context = $events->resolve($viewerId, $spaceId);
        $selection = $this->module->getCurrentEventSelectionStore()->read();
        if ($selection['actor_id'] !== $viewerId || $selection['space_id'] !== $spaceId
            || $selection['selection_revision'] !== $expected['selection_revision'] || $context->accessVersion !== $expected['access_version']) {
            throw new CooperationAnalysisException('context_changed');
        }
        $events->assertCurrent($context); return $context;
    }

    private function parts(): array
    {
        if (!$this->module->isEnabled) { throw new CooperationAnalysisException('dependency_unavailable'); }
        $profile = Yii::$app->getModule('matcher-user-profile'); $privacy = Yii::$app->getModule('matcher-profile-privacy');
        if (!$profile instanceof \humhub\modules\matcherProfile\Module || !$profile->isEnabled
            || !method_exists($profile, 'getSelectedSelfProfileReader')
            || !$privacy instanceof \humhub\modules\matcherPrivacy\Module || !$privacy->isEnabled) {
            throw new CooperationAnalysisException('dependency_unavailable');
        }
        $events = $this->module->getCurrentEventAccess();
        $catalog = new P1FieldCatalogAdapter($profile->getFieldCatalog(...));
        if (PolicyValidator::catalogFingerprint($catalog->read()) !== ReviewedCooperationConfiguration::CATALOG_FINGERPRINT) {
            throw new CooperationAnalysisException('mapping_changed');
        }
        $mapping = ReviewedCooperationConfiguration::mapping(); $bindings = ReviewedCooperationConfiguration::bindings();
        $store = new SqlSelfSelectionStore(Yii::$app->db, $events, new YiiActorSessionSource(Yii::$app->user, Yii::$app->session));
        $p1self = $profile->getSelectedSelfProfileReader();
        $selfProfiles = new P1SelfAnalysisProfileReader($events, $catalog, $mapping, $bindings, $p1self->read(...), $p1self->options(...));
        $manager = new ManageSelfAnalysisSelection($events, $store, $selfProfiles);
        $selfReader = new P1SelectedSelfProjectionReader($events, $store, $selfProfiles);
        $candidates = new P1CooperationProjectionReader($events, $catalog, $mapping, $bindings, $privacy->getDiscoveryBatchService()->read(...));
        $analyzer = new AnalyzeCooperation($events, $candidates, $selfReader, $catalog, $mapping, ReviewedCooperationConfiguration::CATALOG_FINGERPRINT);
        return compact('events', 'manager', 'mapping', 'bindings', 'analyzer');
    }
    private static function selectionView(int $spaceId, array $source): array
    {
        $options = [];
        foreach ($source['options'] as $option) {
            $options[] = ['attribute_id' => $option['attribute_id'], 'source_key' => $option['source_key'], 'scope' => $option['scope'],
                'facts' => array_map(static fn(array $fact): array => ['semantic' => $fact['semantic'], 'values' => $fact['values']], $option['facts'])];
        }
        return ['space_id' => $spaceId, 'selection_version' => $source['selection_version'], 'selection_current' => $source['selection_current'],
            'selected_attribute_ids' => $source['selected_attribute_ids'], 'options' => $options];
    }
    private static function assertOrdinarySnapshot(array $person, array $expected): void
    {
        $actual = ['global' => ['revision' => $person['global']['revision'], 'permission_version' => $person['global']['permission_version']],
            'space' => ['revision' => $person['space']['revision'], 'permission_version' => $person['space']['permission_version']],
            'identity_version' => $person['identity_version'], 'discovery_version' => $person['discovery_version'],
            'privacy_policy_version' => $person['privacy_policy_version']];
        if (Fingerprint::of($actual) !== Fingerprint::of($expected)) { throw new CooperationAnalysisException('projection_changed'); }
    }
}
