<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendationAi\adapters\conversation;
use humhub\modules\matcherRecommendationAi\adapters\provider\ProtocolShape;

/** Closed, bounded protocol; accepts only already-authorized minimal context from the host. */
final class ConversationProtocol
{
    public static function planInput(array $input): array
    {
        ProtocolShape::keys($input, ['schema_version', 'message', 'history', 'requirements', 'field_catalog', 'allowed_actions'], ['request_byte_limit']);
        self::common($input);
        if (!is_array($input['field_catalog']) || !array_is_list($input['field_catalog']) || $input['field_catalog'] === [] || count($input['field_catalog']) > 64) { ProtocolShape::bad(); }
        $catalog = [];
        foreach ($input['field_catalog'] as $field) {
            ProtocolShape::keys($field, ['feature', 'operator', 'value_type', 'allowed_values', 'description', 'candidate_features', 'scope', 'subject'], ['semantic', 'value_schema']);
            ProtocolShape::token($field['feature']); ProtocolShape::text($field['description'], 1024);
            if (!in_array($field['operator'], ProtocolShape::OPERATORS, true) || !in_array($field['value_type'], ['token_set', 'enum', 'intervals'], true)
                || !in_array($field['scope'], ['global', 'event'], true) || $field['subject'] !== 'candidate_requirement'
                || (($field['operator'] === 'interval_overlap') !== ($field['value_type'] === 'intervals'))) { ProtocolShape::bad(); }
            if (isset($field['semantic'])) { ProtocolShape::text($field['semantic'], 256); }
            if (isset($field['value_schema']) && (!is_array($field['value_schema']) || strlen(ProtocolShape::json($field['value_schema'])) > 2048)) { ProtocolShape::bad(); }
            $values = $field['allowed_values'];
            if ($values !== null) {
                if (!is_array($values) || !array_is_list($values) || $values === [] || count($values) > 128) { ProtocolShape::bad(); }
                foreach ($values as $value) { ProtocolShape::text($value, 128); }
                if (count(array_unique($values, SORT_STRING)) !== count($values)) { ProtocolShape::bad(); }
            }
            if (($field['value_type'] === 'enum') !== ($values !== null)) { ProtocolShape::bad(); }
            if (!is_array($field['candidate_features']) || !array_is_list($field['candidate_features']) || $field['candidate_features'] === [] || count($field['candidate_features']) > 16) { ProtocolShape::bad(); }
            foreach ($field['candidate_features'] as $feature) { ProtocolShape::token($feature); }
            $key = $field['feature'] . ':' . $field['operator'];
            if (isset($catalog[$key])) { ProtocolShape::bad(); }
            $catalog[$key] = $field;
        }
        if (!is_array($input['allowed_actions']) || !array_is_list($input['allowed_actions']) || $input['allowed_actions'] === []
            || count($input['allowed_actions']) > 3 || count(array_unique($input['allowed_actions'], SORT_REGULAR)) !== count($input['allowed_actions'])) { ProtocolShape::bad(); }
        foreach ($input['allowed_actions'] as $action) { if (!in_array($action, ['clarify', 'search', 'discuss'], true)) { ProtocolShape::bad(); } }
        self::conditions($input['requirements']['conditions'], false, $catalog);
        return $catalog;
    }

    public static function responseInput(array $input): array
    {
        ProtocolShape::keys($input, ['schema_version', 'mode', 'message', 'history', 'requirements', 'candidates', 'display'], ['request_byte_limit', 'result_limit']);
        self::common($input);
        if (array_key_exists('result_limit', $input) && (!is_int($input['result_limit']) || $input['result_limit'] < 1 || $input['result_limit'] > 5)) { ProtocolShape::bad(); }
        if (!in_array($input['mode'], ['recommend', 'discuss'], true) || !is_array($input['candidates']) || !array_is_list($input['candidates'])
            || $input['candidates'] === [] || count($input['candidates']) > ($input['mode'] === 'discuss' ? 5 : 24)) { ProtocolShape::bad(); }
        $all = []; $shortIds = [];
        foreach ($input['candidates'] as $candidate) {
            ProtocolShape::keys($candidate, ['id', 'rule_score', 'facts', 'unknown_features', 'omitted_fact_count']);
            self::personId($candidate['id']);
            if (isset($all[$candidate['id']]) || (!is_int($candidate['rule_score']) && !is_float($candidate['rule_score']))
                || !is_finite((float)$candidate['rule_score']) || $candidate['rule_score'] < 0 || $candidate['rule_score'] > 1
                || !is_array($candidate['facts']) || !array_is_list($candidate['facts']) || $candidate['facts'] === [] || count($candidate['facts']) > 16
                || !is_array($candidate['unknown_features']) || !array_is_list($candidate['unknown_features']) || count($candidate['unknown_features']) > 64
                || !is_int($candidate['omitted_fact_count']) || $candidate['omitted_fact_count'] < 0 || $candidate['omitted_fact_count'] > 10000
                || strlen(ProtocolShape::json($candidate)) > 768) { ProtocolShape::bad(); }
            foreach ($candidate['unknown_features'] as $feature) { ProtocolShape::token($feature); }
            $facts = [];
            foreach ($candidate['facts'] as $fact) {
                ProtocolShape::keys($fact, ['id', 'feature', 'text', 'positive']);
                if (!is_string($fact['id']) || !preg_match('/^f[1-9][0-9]{0,3}$/D', $fact['id']) || isset($shortIds[$fact['id']]) || !is_bool($fact['positive'])) { ProtocolShape::bad(); }
                ProtocolShape::token($fact['feature']); ProtocolShape::text($fact['text'], 640);
                $facts[$fact['id']] = $fact['positive']; $shortIds[$fact['id']] = true;
            }
            $all[$candidate['id']] = $facts;
        }
        ProtocolShape::keys($input['display'], ['batch_id', 'ordered_ids']);
        if ($input['display']['batch_id'] !== null) { ProtocolShape::token($input['display']['batch_id']); }
        $ordered = $input['display']['ordered_ids'];
        if (!is_array($ordered) || !array_is_list($ordered) || count($ordered) > 5 || count(array_unique($ordered, SORT_REGULAR)) !== count($ordered)) { ProtocolShape::bad(); }
        foreach ($ordered as $id) { self::personId($id); if (!isset($all[$id])) { ProtocolShape::bad(); } }
        if ($input['mode'] === 'discuss' && ($input['display']['batch_id'] === null || count($ordered) !== count($all))) { ProtocolShape::bad(); }
        return $all;
    }

    public static function conditions(mixed $conditions, bool $draftOnly, ?array $catalog = null): void
    {
        if (!is_array($conditions) || !array_is_list($conditions) || count($conditions) > 16) { ProtocolShape::bad(); }
        $seen = [];
        foreach ($conditions as $condition) {
            ProtocolShape::keys($condition, ['feature', 'operator', 'value', 'strength', 'origin']);
            ProtocolShape::token($condition['feature']);
            if (!in_array($condition['operator'], ProtocolShape::OPERATORS, true) || !in_array($condition['strength'], ['soft', 'hard'], true)
                || !in_array($condition['origin'], ['interpreted_draft', 'user_confirmed'], true)
                || ($condition['strength'] === 'hard' && $condition['origin'] !== 'user_confirmed')
                || ($draftOnly && ($condition['strength'] !== 'soft' || $condition['origin'] !== 'interpreted_draft'))) { ProtocolShape::bad(); }
            ProtocolShape::value($condition['value'], $condition['operator']);
            $key = $condition['feature'] . ':' . $condition['operator'];
            if ($catalog !== null) {
                if (!isset($catalog[$key])) { ProtocolShape::bad(); }
                $allowed = $catalog[$key]['allowed_values'];
                if ($allowed !== null) {
                    foreach (is_string($condition['value']) ? [$condition['value']] : $condition['value'] as $value) {
                        if (!in_array($value, $allowed, true)) { ProtocolShape::bad(); }
                    }
                }
            }
            $signature = ProtocolShape::json($condition);
            if (isset($seen[$signature])) { ProtocolShape::bad(); }
            $seen[$signature] = true;
        }
    }

    private static function common(array $input): void
    {
        if ($input['schema_version'] !== 'conversation-v1') { ProtocolShape::bad(); }
        if (array_key_exists('request_byte_limit', $input) && (!is_int($input['request_byte_limit']) || $input['request_byte_limit'] < 1 || $input['request_byte_limit'] > 24576)) { ProtocolShape::bad(); }
        ProtocolShape::text($input['message'], 4096);
        if (!is_array($input['history']) || !array_is_list($input['history']) || count($input['history']) > 12) { ProtocolShape::bad(); }
        foreach ($input['history'] as $turn) {
            ProtocolShape::keys($turn, ['role', 'message']);
            if (!in_array($turn['role'], ['user', 'assistant'], true)) { ProtocolShape::bad(); }
            ProtocolShape::text($turn['message'], 4096);
        }
        ProtocolShape::keys($input['requirements'], ['messages', 'conditions']);
        if (!is_array($input['requirements']['messages']) || !array_is_list($input['requirements']['messages']) || count($input['requirements']['messages']) > 20) { ProtocolShape::bad(); }
        foreach ($input['requirements']['messages'] as $message) { ProtocolShape::text($message, 4096); }
        self::conditions($input['requirements']['conditions'], false);
    }

    private static function personId(mixed $id): void
    {
        if (!is_string($id) || !preg_match('/^[1-9][0-9]{0,19}$/D', $id)) { ProtocolShape::bad(); }
    }
}
