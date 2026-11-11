<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\conversation;
use humhub\modules\matcherRecommendation\contracts\QueryIntent;
use humhub\modules\matcherRecommendation\domain\conversation\ConversationInput;

/** HTTP confirmation intent is distinct from model conditions and ordinary chat. */
final class ConversationHttpInput
{
    public static function parse(string $raw, string $operation): array
    {
        if (strlen($raw) > 16384) { self::bad('The request body exceeds 16 KiB.', 413); }
        try { $object = json_decode($raw, false, 16, JSON_THROW_ON_ERROR); $body = json_decode($raw, true, 16, JSON_THROW_ON_ERROR); }
        catch (\JsonException) { self::bad('Provide a JSON object.'); }
        if (!$object instanceof \stdClass) { self::bad('Provide a JSON object.'); }
        $allowed = match ($operation) {
            'create' => [], 'turn' => ['expected_version', 'message', 'command'],
            'confirm' => ['expected_version', 'requirements_version', 'confirmation_intent', 'message', 'command', 'conditions'],
            default => throw new \LogicException('Unknown HTTP operation.'),
        };
        $keys = array_keys($body); sort($keys); sort($allowed);
        if ($keys !== $allowed) { self::bad('Provide exactly the documented request fields.'); }
        if ($operation === 'create') { return []; }
        if (!is_int($body['expected_version']) || $body['expected_version'] < 1 || $body['expected_version'] >= PHP_INT_MAX
            || !ConversationInput::text($body['message'], 3072)
            || !in_array($body['command'], $operation === 'turn' ? ['chat', 'recommend', 'refresh'] : ['recommend', 'refresh'], true)) { self::bad('Invalid version, message, or command.'); }
        $body['intent'] = null;
        if ($operation === 'confirm') {
            if (!is_int($body['requirements_version']) || $body['requirements_version'] < 1
                || $body['confirmation_intent'] !== 'replace_complete_requirements'
                || !is_array($object->conditions) || count($object->conditions) > 16) { self::bad('Confirm the complete requirements snapshot and current version.'); }
            $conditions = [];
            foreach ($object->conditions as $condition) {
                if (!$condition instanceof \stdClass) { self::bad('Conditions must be objects.'); }
                $keys = array_keys(get_object_vars($condition)); sort($keys);
                if ($keys !== ['feature', 'operator', 'strength', 'value'] || !in_array($condition->strength, ['hard', 'soft'], true)) { self::bad('Only feature, operator, value and strength are accepted.'); }
                if ($condition->value instanceof \stdClass || (!is_string($condition->value) && !is_array($condition->value))) { self::bad('Condition values use strings or JSON arrays.'); }
                if (is_array($condition->value)) {
                    foreach ($condition->value as $value) {
                        if ($condition->operator === 'interval_overlap' ? !$value instanceof \stdClass : !is_string($value)) { self::bad('Condition array entries use the documented token or interval shape.'); }
                    }
                }
            }
            foreach ($body['conditions'] as $condition) {
                $conditions[] = ['feature' => $condition['feature'], 'operator' => $condition['operator'], 'value' => $condition['value'],
                    'strength' => $condition['strength'], 'origin' => 'user_confirmed'];
            }
            try { $body['intent'] = new QueryIntent('person', $conditions); } catch (\Throwable) { self::bad('Invalid confirmed conditions.'); }
        }
        return $body;
    }
    public static function key(mixed $key): string
    {
        if (!is_string($key) || !preg_match('/^[A-Za-z0-9_.:-]{1,128}$/D', $key)) { self::bad('Provide a valid Idempotency-Key header.'); }
        return $key;
    }
    private static function bad(string $message, int $status = 400): never { throw new ConversationHttpException($status, 'INVALID_REQUEST', $message); }
}
