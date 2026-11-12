<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\application\analysis;

use humhub\modules\matcherRecommendation\contracts\{ContractShape, CurrentEventContext};
use humhub\modules\matcherRecommendation\contracts\analysis\{CooperationAnalysisException, SelectedSelfAttributes};
use humhub\modules\matcherRecommendation\contracts\ports\{CurrentEventAccess, SelfAnalysisProfileReader, SelfSelectionStore};
use humhub\modules\matcherRecommendation\domain\config\Fingerprint;

/** Explicit selection only; no client-authored consent, owner, scope, profile versions or values. */
final class ManageSelfAnalysisSelection
{
    public function __construct(private readonly CurrentEventAccess $events, private readonly SelfSelectionStore $selections, private readonly SelfAnalysisProfileReader $profiles) {}

    public function read(int $viewerId, ?int $spaceId = null): array
    {
        return $this->safe(function () use ($viewerId, $spaceId): array {
            $context = $this->context($viewerId, $spaceId); $source = $this->profiles->options($context); $state = $this->selections->state($context); $selection = $state['selection'];
            $current = $selection === null ? $state['version'] === 0 : Fingerprint::of($selection->expectedVersions) === Fingerprint::of($source['projection']->versions);
            $ids = $selection === null ? [] : array_map(static fn($ref) => $ref->sourceId, $selection->references);
            if (array_diff($ids, array_column($source['options'], 'attribute_id')) !== []) { $current = false; }
            $this->events->assertCurrent($context);
            return ['selection_version' => $state['version'], 'selection_current' => $current,
                'selected_attribute_ids' => $current ? $ids : [], 'options' => $source['options'],
                'profile_versions' => get_object_vars($source['projection']->versions)];
        });
    }

    public function replace(int $viewerId, int $spaceId, array $attributeIds, int $expectedSelectionVersion, ?CurrentEventContext $expectedContext = null): SelectedSelfAttributes
    {
        return $this->safe(function () use ($viewerId, $spaceId, $attributeIds, $expectedSelectionVersion, $expectedContext): SelectedSelfAttributes {
            ContractShape::identifiers($attributeIds, 6400);
            if ($expectedSelectionVersion < 0 || $expectedSelectionVersion >= 2147483646) { throw new CooperationAnalysisException('invalid_request'); }
            foreach ($attributeIds as $id) { if (strlen($id) > 128) { throw new CooperationAnalysisException('invalid_request'); } }
            $context = $this->context($viewerId, $spaceId);
            if ($expectedContext !== null && Fingerprint::of($context) !== Fingerprint::of($expectedContext)) { throw new CooperationAnalysisException('context_changed'); }
            $state = $this->selections->state($context);
            if ($state['version'] !== $expectedSelectionVersion) { throw new CooperationAnalysisException('selection_unavailable'); }
            $projection = $this->profiles->read($context, $attributeIds); $references = [];
            foreach ($projection->features as $feature) { foreach ($feature['evidence'] as $ref) { $references[$ref->sourceId] = $ref; } }
            if (count($references) !== count($attributeIds) || array_diff(array_keys($references), $attributeIds) !== []) { throw new CooperationAnalysisException('selection_unavailable'); }
            $fresh = $this->profiles->read($context, $attributeIds);
            if (Fingerprint::of($projection) !== Fingerprint::of($fresh)) { throw new CooperationAnalysisException('projection_changed'); }
            $selection = new SelectedSelfAttributes($viewerId, $spaceId, 'selection-' . bin2hex(random_bytes(16)),
                $expectedSelectionVersion + 1, $projection->versions, array_values($references));
            $this->events->assertCurrent($context); $this->selections->replace($context, $expectedSelectionVersion, $selection);
            $this->events->assertCurrent($context);
            return $selection;
        });
    }

    public function current(int $viewerId, int $spaceId, int $expectedSelectionVersion): SelectedSelfAttributes
    {
        return $this->safe(function () use ($viewerId, $spaceId, $expectedSelectionVersion): SelectedSelfAttributes {
            if ($expectedSelectionVersion < 1) { throw new CooperationAnalysisException('selection_unavailable'); }
            $context = $this->context($viewerId, $spaceId); $current = $this->selections->read($context);
            if ($current === null || $current->selectionVersion !== $expectedSelectionVersion) { throw new CooperationAnalysisException('selection_unavailable'); }
            $metadata = $this->profiles->read($context, []);
            if (Fingerprint::of($metadata->versions) !== Fingerprint::of($current->expectedVersions)) { throw new CooperationAnalysisException('selection_unavailable'); }
            $fresh = $this->selections->read($context);
            if ($fresh === null || Fingerprint::of($fresh) !== Fingerprint::of($current)) { throw new CooperationAnalysisException('selection_unavailable'); }
            $this->events->assertCurrent($context); return $current;
        });
    }

    private function context(int $viewerId, ?int $spaceId): CurrentEventContext
    {
        if ($viewerId < 1 || ($spaceId !== null && $spaceId < 1)) { throw new CooperationAnalysisException('invalid_request'); }
        $context = $this->events->resolve($viewerId, $spaceId);
        if ($context->viewerId !== $viewerId || ($spaceId !== null && $spaceId !== $context->spaceId)) { throw new CooperationAnalysisException('context_changed'); }
        $this->events->assertCurrent($context); return $context;
    }
    private function safe(callable $run): mixed
    {
        try { return $run(); }
        catch (CooperationAnalysisException $error) { throw new CooperationAnalysisException($error->reason); }
        catch (\InvalidArgumentException) { throw new CooperationAnalysisException('invalid_request'); }
        catch (\Throwable) { throw new CooperationAnalysisException('dependency_unavailable'); }
    }
}
