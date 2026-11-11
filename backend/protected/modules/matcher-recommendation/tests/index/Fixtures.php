<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\tests\index;
use humhub\modules\matcherRecommendation\contracts\{CandidateProjection, CandidateRequest, CurrentEventContext, EvidenceRef, ProjectionVersions};
use humhub\modules\matcherRecommendation\contracts\ports\{CandidateProjectionReader, PolicyStore};
use humhub\modules\matcherRecommendation\domain\RulePolicy;
use humhub\modules\matcherRecommendation\tests\policy\Fixtures as PolicyFixtures;

final class MutablePolicies implements PolicyStore
{
    public function __construct(public RulePolicy $policy) {}
    public function current(CurrentEventContext $context): RulePolicy { return $this->policy; }
}

/** Test-only port: production wiring must use the independently authorized P1/P8 batch bridge. */
final class MutableProjectionReader implements CandidateProjectionReader
{
    public array $batches = [];
    public array $overrides = [];
    public array $omitted = [];
    public array $versions = [];
    public array $undeclaredFeatures = [];
    public ?\Closure $beforeRead = null;
    public function read(CandidateRequest $request): array
    {
        $this->batches[] = $request->targetIds;
        if ($this->beforeRead !== null) { ($this->beforeRead)($this, $request); }
        $out = [];
        foreach ($request->targetIds as $id) {
            if (in_array($id, $this->omitted, true)) { continue; }
            $version = $this->versions[$id] ?? ['revision' => 1, 'permission_version' => 1, 'identity' => 1, 'policy' => 'synthetic-privacy-v1'];
            $scopes = ['global' => array_intersect_key($version, array_flip(['revision', 'permission_version'])), 'space:' . $request->context->spaceId => ['revision' => 1, 'permission_version' => 1]];
            $values = $this->overrides[$id] ?? [
                'topics' => ['social', 'unique-' . $id], 'skills' => [' JS ', 'javascript'], 'offers' => ['backend'],
                'preferences' => ['async'], 'self_type' => 'INTJ',
                'availability' => [
                    ['starts_at' => '2026-11-11T10:00:00.000001+08:00', 'ends_at' => '2026-11-11T11:00:00.000001+08:00'],
                    ['starts_at' => '2026-11-11T03:00:00.000001Z', 'ends_at' => '2026-11-11T04:00:00.000002Z'],
                ],
            ];
            $features = [];
            foreach ($values as $key => $value) {
                $scope = in_array($key, ['offers', 'availability'], true) ? 'space:' . $request->context->spaceId : 'global';
                $features[$key] = ['value' => $value, 'evidence' => [new EvidenceRef('person', $id, 'profile_attribute', 'synthetic-' . $id . '-' . $key, $scope, $scopes[$scope]['revision'], $scopes[$scope]['permission_version'])]];
            }
            $unknown = array_values(array_diff(array_keys(PolicyFixtures::parameters()['bindings']), array_keys($features)));
            foreach ($this->undeclaredFeatures as $key) { unset($features[$key]); }
            $unknown = array_values(array_diff($unknown, $this->undeclaredFeatures));
            $out[] = new CandidateProjection('person', $id, $request->context->spaceId, new ProjectionVersions($scopes, 2, $version['policy'], $version['identity']), $features, $unknown);
        }
        return $out;
    }
}
