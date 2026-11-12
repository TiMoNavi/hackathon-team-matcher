<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\analysis;

/** Explicit public projection: never serialize internal context, grants or selection receipts. */
final class CooperationHttpView
{
    public const DIMENSIONS = ['contribution_capability', 'project_direction', 'role_complementarity', 'availability', 'collaboration_arrangements'];
    public static function analysis(array $result, int $selectionVersion): array
    {
        if (array_column($result['dimensions'] ?? [], 'dimension') !== self::DIMENSIONS) { throw new \UnexpectedValueException('Invalid analysis dimensions.'); }
        $rows = [];
        foreach ($result['dimensions'] as $row) {
            if (!in_array($row['status'], ['supported', 'partial', 'unknown', 'conflict'], true)) {
                throw new \UnexpectedValueException('Invalid public analysis status.');
            }
            $evidence = []; $seen = [];
            foreach ($row['evidence'] as $item) {
                $ref = $item['reference'];
                if (!in_array($item['subject'], ['self', 'candidate'], true) || $ref['sourceKind'] !== 'profile_attribute'
                    || $ref['targetType'] !== 'person' || $ref['targetId'] !== $item['target_id']
                    || $item['target_id'] !== ($item['subject'] === 'self' ? $result['self_id'] : $result['candidate_id'])
                    || !in_array($ref['scope'], ['global', 'space:' . $result['space_id']], true)) {
                    throw new \UnexpectedValueException('Invalid public evidence.');
                }
                $public = ['subject' => $item['subject'], 'owner_id' => (int)$item['target_id'],
                    'attribute_id' => $ref['sourceId'], 'scope' => $ref['scope'],
                    'profile_revision' => $ref['contentRevision'], 'permission_version' => $ref['permissionVersion']];
                $key = json_encode($public, JSON_THROW_ON_ERROR);
                if (!isset($seen[$key])) { $evidence[] = $public; $seen[$key] = true; }
            }
            $rows[] = ['dimension' => $row['dimension'], 'status' => $row['status'],
                'conclusion_code' => $row['conclusion_code'], 'question_codes' => $row['question_codes'],
                'evidence' => $evidence, 'facts' => self::facts($row['dimension'], $row['facts'])];
        }
        return ['space_id' => $result['space_id'], 'candidate_id' => (int)$result['candidate_id'],
            'selection_version' => $selectionVersion, 'explanation_source' => 'rules',
            'hard_conditions_checked' => false, 'dimensions' => $rows];
    }
    private static function facts(string $dimension, array $facts): array
    {
        $coverage = static fn(array $value): array => ['status' => $value['status'], 'matched' => $value['matched'],
            'uncovered_recorded_needs' => $value['uncovered_recorded_needs']];
        $arrangement = static fn(array $value): array => ['status' => $value['status'], 'shared_codes' => $value['shared_codes']];
        return match ($dimension) {
            'contribution_capability' => ['capability' => $coverage($facts['capability']), 'current_contribution' => $coverage($facts['current_contribution'])],
            'project_direction' => ['shared_codes' => $facts['shared_codes']],
            'role_complementarity' => ['candidate_to_self' => $coverage($facts['candidate_to_self']), 'self_to_candidate' => $coverage($facts['self_to_candidate'])],
            'availability' => ['shared_windows' => array_map(static fn(array $row): array => array_intersect_key($row, array_flip(['starts_at', 'ends_at', 'timezone'])), $facts['shared_windows']), 'hard_condition_check' => 'not_performed'],
            'collaboration_arrangements' => ['collaboration_modes' => $arrangement($facts['collaboration_modes']), 'communication_preferences' => $arrangement($facts['communication_preferences'])],
        };
    }
}
