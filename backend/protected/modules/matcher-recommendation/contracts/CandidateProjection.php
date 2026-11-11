<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts;

/**
 * Structurally consistent minimal projection. Construction does NOT grant discovery rights.
 * Adapters must enforce confirmed/authenticated AND a separate discovery-purpose allowlist.
 * Contacts, private/friends fields, drafts, raw sources and messages are never eligible,
 * even if P1 returns confirmed authenticated contact_* entries to a profile detail view.
 */
final class CandidateProjection
{
    /**
     * @param array<string,array{value:mixed,evidence:list<EvidenceRef>}> $features Logical feature keys, not SQL columns.
     * @param list<string> $unknownFeatures Unknown optional values carry no positive evidence.
     */
    public function __construct(
        public readonly string $targetType,
        public readonly string $targetId,
        public readonly int $spaceId,
        public readonly ProjectionVersions $versions,
        public readonly array $features,
        public readonly array $unknownFeatures = [],
    ) {
        ContractShape::target($targetType);
        ContractShape::token($targetId);
        if ($spaceId <= 0) { throw new \InvalidArgumentException('A current Space is required.'); }
        ContractShape::identifiers($unknownFeatures, count($unknownFeatures));
        foreach ($versions->scopes as $scope => $_) {
            if ($scope !== 'global' && $scope !== 'space:' . $spaceId) {
                throw new \InvalidArgumentException('Cross-Space version in projection.');
            }
        }
        foreach ($features as $key => $feature) {
            if (!is_string($key) || !is_array($feature)) { throw new \InvalidArgumentException('Invalid feature.'); }
            ContractShape::token($key);
            $keys = array_keys($feature); sort($keys);
            if ($keys !== ['evidence', 'value'] || !is_array($feature['evidence']) || !array_is_list($feature['evidence'])
                || $feature['evidence'] === [] || $feature['value'] === null || in_array($key, $unknownFeatures, true)) {
                throw new \InvalidArgumentException('Known feature needs evidence and cannot also be unknown.');
            }
            ContractShape::jsonValue($feature['value']);
            foreach ($feature['evidence'] as $evidence) {
                if (!$evidence instanceof EvidenceRef) { throw new \InvalidArgumentException('Invalid evidence type.'); }
                $version = $versions->scopes[$evidence->scope] ?? null;
                if ($evidence->targetType !== $targetType || $evidence->targetId !== $targetId || $version === null
                    || $evidence->contentRevision !== $version['revision'] || $evidence->permissionVersion !== $version['permission_version']) {
                    throw new \InvalidArgumentException('Evidence owner, scope or version does not match projection.');
                }
            }
        }
    }
}
