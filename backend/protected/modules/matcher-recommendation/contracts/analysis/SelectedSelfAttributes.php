<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\analysis;

use humhub\modules\matcherRecommendation\contracts\{ContractShape, EvidenceRef, ProjectionVersions};

/**
 * Internal reference to an explicitly chosen, complete selection. It is not consent or a
 * grant: SelectedSelfProjectionReader must verify it against the current owning authority.
 * A replacement selection needs its new authoritative version, including replacement by [].
 * There is deliberately no profile body or client-authored field value in this object.
 */
final class SelectedSelfAttributes
{
    public readonly array $references;
    /**
     * @param list<EvidenceRef> $references Explicit confirmed attribute references, not fields.
     * No arbitrary selection-count limit is derived from the logical feature/candidate limits.
     * A future transport must separately define its request-size budget; this is not an HTTP DTO.
     */
    public function __construct(
        public readonly int $ownerId, public readonly int $spaceId,
        public readonly string $selectionId, public readonly int $selectionVersion,
        public readonly ProjectionVersions $expectedVersions, array $references,
    ) {
        ContractShape::token($selectionId);
        if ($ownerId < 1 || $spaceId < 1 || strlen($selectionId) > 128 || $selectionVersion < 1
            || !array_is_list($references)) { throw new \InvalidArgumentException('Invalid explicit self selection.'); }
        self::assertVersions($expectedVersions, $spaceId);
        $seen = [];
        foreach ($references as $ref) {
            if (!$ref instanceof EvidenceRef || $ref->targetType !== 'person' || $ref->targetId !== (string)$ownerId
                || $ref->sourceKind !== 'profile_attribute' || strlen($ref->sourceId) > 128 || isset($seen[$ref->sourceId])) {
                throw new \InvalidArgumentException('Self selection references must be unique and belong to the viewer.');
            }
            $version = $expectedVersions->scopes[$ref->scope] ?? null;
            if ($version === null || $version['revision'] !== $ref->contentRevision || $version['permission_version'] !== $ref->permissionVersion) {
                throw new \InvalidArgumentException('Selected attribute scope and versions must match the selection snapshot.');
            }
            $seen[$ref->sourceId] = true;
        }
        usort($references, static fn(EvidenceRef $a, EvidenceRef $b): int => strcmp($a->sourceId, $b->sourceId));
        $this->references = $references;
    }

    public static function assertVersions(ProjectionVersions $versions, int $spaceId): void
    {
        $scopes = array_keys($versions->scopes); sort($scopes, SORT_STRING);
        if ($scopes !== ['global', 'space:' . $spaceId] || $versions->identityVersion === null) {
            throw new \InvalidArgumentException('Analysis requires complete global/activity and identity versions.');
        }
    }
}
