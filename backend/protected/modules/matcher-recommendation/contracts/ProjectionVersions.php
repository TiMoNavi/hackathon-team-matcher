<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts;

/** Separate P1 scope revisions. Identity and external relationship/access versions are independent. */
final class ProjectionVersions
{
    /** @param array<string,array{revision:int,permission_version:int}> $scopes */
    public function __construct(
        public readonly array $scopes,
        public readonly int $schemaVersion,
        public readonly string $profilePolicyVersion,
        public readonly ?int $identityVersion = null,
    ) {
        if ($scopes === [] || $schemaVersion < 1 || ($identityVersion !== null && $identityVersion < 0)) {
            throw new \InvalidArgumentException('Invalid projection versions.');
        }
        ContractShape::token($profilePolicyVersion);
        foreach ($scopes as $scope => $versions) {
            if (!is_string($scope) || !is_array($versions)) { throw new \InvalidArgumentException('Invalid scope version.'); }
            ContractShape::scope($scope);
            $keys = array_keys($versions); sort($keys);
            if ($keys !== ['permission_version', 'revision']) { throw new \InvalidArgumentException('Incomplete scope version.'); }
            foreach ($versions as $version) {
                if (!is_int($version) || $version < 0) { throw new \InvalidArgumentException('Version must be a nonnegative integer.'); }
            }
        }
    }
}
