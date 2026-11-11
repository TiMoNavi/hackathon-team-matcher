<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts;

/** A reference to current authorized evidence; it carries no private source material. */
final class EvidenceRef
{
    public function __construct(
        public readonly string $targetType,
        public readonly string $targetId,
        public readonly string $sourceKind,
        public readonly string $sourceId,
        public readonly string $scope,
        public readonly int $contentRevision,
        public readonly int $permissionVersion,
    ) {
        ContractShape::target($targetType);
        ContractShape::token($targetId);
        ContractShape::token($sourceId);
        ContractShape::scope($scope);
        if (!in_array($sourceKind, ['profile_attribute', 'idea_fact'], true)
            || ($targetType === 'person') !== ($sourceKind === 'profile_attribute')
            || $contentRevision < 0 || $permissionVersion < 0) {
            throw new \InvalidArgumentException('Invalid evidence reference.');
        }
    }

    /** P1 attribute_id for profile evidence; idea facts use their own stable reference. */
    public function attributeId(): ?string
    {
        return $this->sourceKind === 'profile_attribute' ? $this->sourceId : null;
    }
}
