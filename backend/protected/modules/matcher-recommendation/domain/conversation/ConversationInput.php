<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain\conversation;

use humhub\modules\matcherRecommendation\contracts\QueryIntent;
use humhub\modules\matcherRecommendation\domain\RulePolicy;
use humhub\modules\matcherRecommendation\domain\ai\AiRecommendationException;

/** Config-derived semantics; no native profile column is part of this protocol. */
final class ConversationInput
{
    public static function catalog(RulePolicy $policy): array
    {
        $rows = [];
        foreach ($policy->parameters['rules'] as $rule) {
            $bindings = array_map(static fn(string $f): array => $policy->parameters['bindings'][$f], $rule['candidate_features']);
            $binding = $bindings[0]; $schema = $binding['value_schema'];
            $enum = []; $open = false;
            foreach ($bindings as $source) {
                $sourceSchema = $source['value_schema']; $transform = $source['transform'];
                $transformed = in_array($transform, ['identity', 'interval'], true) ? $sourceSchema : ($sourceSchema['properties'][$transform] ?? []);
                $values = $transformed['enum'] ?? $transformed['items']['enum'] ?? null;
                if ($values === null) { $open = true; continue; }
                $enum = array_merge($enum, $values);
            }
            // Any open source makes the query domain open; all closed sources contribute their union.
            $enum = $open ? null : array_values(array_unique($enum));
            if ($enum !== null) {
                foreach ($rule['aliases'] as $from => $to) {
                    foreach ($enum as $value) { if (strtolower(trim($to)) === strtolower(trim($value))) { $enum[] = $from; break; } }
                }
                $enum = array_values(array_unique($enum)); sort($enum, SORT_STRING);
                $schema = ['type' => 'string', 'enum' => $enum];
            }
            $semantic = $binding['semantic'];
            $description = match ($semantic) {
                'declared_contribution' => '候选在本次活动明确愿意承担的贡献；不是本人已有贡献，也不是仅会某技能。',
                'capability' => '候选已确认的能力或经历；不代表本次活动的贡献意愿，不提升经历的责任程度。',
                'availability' => '候选本次活动明确可投入的时间；未填写不是有空。',
                'self_reported_type' => '候选本人明确自述的类型；仅可使用允许枚举，不从岗位或措辞推断性格。',
                'collaboration_preference' => '候选明确自述的协作偏好；不推断人格、可靠性或成功率。',
                default => '候选已确认的相关主题；仅在本次需求相关时参与。',
            };
            $rows[] = ['feature' => $rule['query_feature'], 'operator' => $rule['operator'],
                'value_type' => $rule['operator'] === 'interval_overlap' ? 'intervals' : ($enum === null ? 'token_set' : 'enum'),
                'allowed_values' => $enum, 'description' => $description, 'candidate_features' => $rule['candidate_features'],
                'scope' => $binding['scope'], 'subject' => 'candidate_requirement', 'semantic' => $semantic, 'value_schema' => $schema];
        }
        return $rows;
    }

    public static function assertTypes(QueryIntent $intent, RulePolicy $policy): void
    {
        $catalog = [];
        foreach (self::catalog($policy) as $row) { $catalog[$row['feature'] . ':' . $row['operator']] = $row; }
        foreach ($intent->conditions as $condition) {
            $row = $catalog[$condition['feature'] . ':' . $condition['operator']] ?? null;
            if ($row === null) { throw new AiRecommendationException('invalid_model_output'); }
            if ($row['allowed_values'] !== null) {
                $values = is_string($condition['value']) ? [$condition['value']] : $condition['value'];
                if (!is_array($values) || !array_is_list($values) || $values === []) { throw new AiRecommendationException('invalid_model_output'); }
                foreach ($values as $value) {
                    if (!in_array($value, $row['allowed_values'], true)) { throw new AiRecommendationException('invalid_model_output'); }
                }
            }
        }
    }

    /** Equivalence for deduplication only; distinct soft values never inherit a hard condition. */
    public static function conditionKey(array $condition, RulePolicy $policy): string
    {
        $rule = null;
        foreach ($policy->parameters['rules'] as $candidate) {
            if ($candidate['query_feature'] === $condition['feature'] && $candidate['operator'] === $condition['operator']) { $rule = $candidate; break; }
        }
        if ($rule === null) { throw new AiRecommendationException('invalid_model_output'); }
        $value = $condition['value'];
        if ($condition['operator'] !== 'interval_overlap') {
            $aliases = [];
            foreach ($rule['aliases'] as $from => $to) { $aliases[strtolower(trim($from))] = strtolower(trim($to)); }
            $tokens = is_string($value) ? [$value] : $value;
            $value = [];
            foreach ($tokens as $token) { $normal = strtolower(trim($token)); $value[] = $aliases[$normal] ?? $normal; }
            $value = array_values(array_unique($value)); sort($value, SORT_STRING);
        }
        return \humhub\modules\matcherRecommendation\domain\config\Fingerprint::of([$condition['feature'], $condition['operator'], $value]);
    }

    public static function text(mixed $value, int $max): bool
    {
        return is_string($value) && trim($value) !== '' && strlen($value) <= $max && preg_match('//u', $value) === 1;
    }

    public static function json(mixed $value): string
    {
        return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
    }
}
