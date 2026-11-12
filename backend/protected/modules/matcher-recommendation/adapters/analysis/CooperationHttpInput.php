<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\analysis;

use humhub\modules\matcherRecommendation\contracts\ContractShape;
use humhub\modules\matcherRecommendation\contracts\analysis\CooperationAnalysisException;

/** Strict public optimistic preconditions; client input never grants authorization. */
final class CooperationHttpInput
{
    public static function selection(\stdClass $body): array
    {
        self::keys($body, ['attribute_ids', 'expected_selection_version', 'expected_current_event']);
        if (!is_array($body->attribute_ids) || !array_is_list($body->attribute_ids)) { self::invalid(); }
        $ids = [];
        foreach ($body->attribute_ids as $id) {
            if (!is_string($id) || strlen($id) > 128) { self::invalid(); }
            try { ContractShape::token($id); } catch (\InvalidArgumentException) { self::invalid(); }
            if (in_array($id, $ids, true)) { self::invalid(); }
            $ids[] = $id;
        }
        return ['attribute_ids' => $ids, 'expected_selection_version' => self::version($body->expected_selection_version),
            'expected_current_event' => self::context($body->expected_current_event)];
    }
    public static function analysis(\stdClass $body): array
    {
        self::keys($body, ['expected_selection_version', 'expected_candidate', 'expected_current_event']);
        if (!$body->expected_candidate instanceof \stdClass) { self::invalid(); }
        $candidate = $body->expected_candidate;
        self::keys($candidate, ['global', 'space', 'identity_version', 'discovery_version', 'privacy_policy_version']);
        $result = [];
        foreach (['global', 'space'] as $scope) {
            if (!$candidate->$scope instanceof \stdClass) { self::invalid(); }
            self::keys($candidate->$scope, ['revision', 'permission_version']);
            $result[$scope] = ['revision' => self::version($candidate->$scope->revision),
                'permission_version' => self::version($candidate->$scope->permission_version)];
        }
        foreach (['identity_version', 'discovery_version'] as $field) { $result[$field] = self::version($candidate->$field); }
        if (!is_string($candidate->privacy_policy_version) || strlen($candidate->privacy_policy_version) > 512) { self::invalid(); }
        try { ContractShape::token($candidate->privacy_policy_version); } catch (\InvalidArgumentException) { self::invalid(); }
        $result['privacy_policy_version'] = $candidate->privacy_policy_version;
        return ['expected_selection_version' => self::version($body->expected_selection_version), 'expected_candidate' => $result,
            'expected_current_event' => self::context($body->expected_current_event)];
    }
    private static function context(mixed $value): array
    {
        if (!$value instanceof \stdClass) { self::invalid(); }
        self::keys($value, ['selection_revision', 'access_version']);
        if (!is_string($value->selection_revision) || !preg_match('/^selection-[a-f0-9]{32}$/D', $value->selection_revision)
            || !is_string($value->access_version) || strlen($value->access_version) > 512) { self::invalid(); }
        try { ContractShape::token($value->access_version); } catch (\InvalidArgumentException) { self::invalid(); }
        return ['selection_revision' => $value->selection_revision, 'access_version' => $value->access_version];
    }
    public static function version(mixed $value): int
    {
        if (!is_int($value) || $value < 0 || $value > 9007199254740991) { self::invalid(); }
        return $value;
    }
    private static function keys(\stdClass $value, array $expected): void
    {
        $actual = array_keys(get_object_vars($value)); sort($actual); sort($expected);
        if ($actual !== $expected) { self::invalid(); }
    }
    private static function invalid(): never { throw new CooperationAnalysisException('invalid_request'); }
}
