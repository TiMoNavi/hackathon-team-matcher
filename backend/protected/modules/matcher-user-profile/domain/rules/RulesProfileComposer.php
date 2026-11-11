<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\domain\rules;

use humhub\modules\matcherProfile\domain\FieldCatalog;
use humhub\modules\matcherProfile\domain\ProfileException;

/** Maps only explicit answers. A generated sentence uses global answers, never Space context. */
final class RulesProfileComposer implements \humhub\modules\matcherProfile\domain\ports\ProfileComposer
{
    public function compose(array $profiles, array $questions, array $answers): array
    {
        $byQuestion = array_column($answers, null, 'question_id');
        $mapped = ['global' => [], 'space' => []];
        foreach ($questions as $question) {
            $answer = $byQuestion[$question['id']] ?? null;
            if ($answer === null) { throw new ProfileException('ANSWERS_INCOMPLETE', 'Answer or skip each question before preparing the profile.'); }
            if ($answer['answer_type'] === 'skipped') { continue; }
            foreach ($this->map($question, $answer) as $item) { $mapped[$question['scope']][] = $item; }
        }
        $fields = ['global' => [], 'space' => []];
        foreach ($mapped as $scope => $items) {
            $current = $profiles[$scope]['attributes'] ?? [];
            foreach ($items as $item) {
                $definition = FieldCatalog::get($item['key']);
                $match = null;
                foreach ($current as $candidate) {
                    if ($candidate['key'] !== $item['key']) { continue; }
                    if ($definition['cardinality'] === 'one' || (($candidate['value']['code'] ?? null) === ($item['value']['code'] ?? null))) { $match = $candidate; break; }
                }
                if ($match !== null) {
                    if ($definition['cardinality'] === 'many' || self::canonical($match['value']) === self::canonical($item['value'])) { continue; }
                    $item['attribute_id'] = $match['attribute_id'];
                    $item['visibility'] = $match['visibility'];
                } else { $item['visibility'] = 'authenticated'; }
                $fields[$scope][] = $item;
            }
        }
        if (!in_array('headline', array_column($profiles['global']['attributes'], 'key'), true)) {
            $role = array_values(array_filter($mapped['global'], static fn(array $v): bool => $v['key'] === 'role'));
            $interest = array_values(array_filter($mapped['global'], static fn(array $v): bool => $v['key'] === 'interest'));
            $parts = [];
            if ($role !== []) { $parts[] = '可以参与' . implode('、', array_column(array_column($role, 'value'), 'label')); }
            if ($interest !== []) { $parts[] = '关注' . implode('、', array_column(array_column($interest, 'value'), 'label')); }
            if ($parts !== []) {
                $visibility = 'authenticated'; $rank = ['authenticated' => 0, 'friends' => 1, 'private' => 2];
                foreach (array_merge($role, $interest) as $source) {
                    foreach ($profiles['global']['attributes'] as $current) {
                        if ($current['key'] === $source['key'] && ($current['value']['code'] ?? null) === ($source['value']['code'] ?? null) && $rank[$current['visibility']] > $rank[$visibility]) { $visibility = $current['visibility']; }
                    }
                }
                $fields['global'][] = ['key' => 'headline', 'value' => mb_substr(implode('，', $parts), 0, 160, 'UTF-8'), 'visibility' => $visibility];
            }
        }
        return ['global_fields' => $fields['global'], 'space_fields' => $fields['space'], 'generation_mode' => 'rules', 'llm_calls' => 0];
    }
    private static function canonical(mixed $value): mixed
    {
        if (!is_array($value)) { return $value; }
        if (!array_is_list($value)) { ksort($value); }
        return array_map([self::class, 'canonical'], $value);
    }
    private function map(array $question, array $answer): array
    {
        $key = $question['target_key']; $options = array_column($question['options'], 'label', 'code');
        $codes = $answer['selected_options']; $free = $answer['free_text'];
        $labels = array_map(static fn(string $code): string => $options[$code], $codes);
        if (in_array($key, ['role', 'interest', 'event_role'], true)) {
            $out = [];
            foreach ($codes as $code) { $out[] = ['key' => $key, 'value' => ['code' => $code, 'label' => $options[$code]]]; }
            if ($free !== '') { $out[] = ['key' => $key, 'value' => ['code' => 'self_' . substr(hash('sha256', $free), 0, 16), 'label' => mb_substr($free, 0, 120, 'UTF-8'), 'note' => $free]]; }
            return $out;
        }
        if ($key === 'personality') { $value = ['traits' => $labels]; if ($free !== '') { $value['self_description'] = $free; } }
        elseif ($key === 'seeking') { $value = implode('；', array_filter([implode('、', $labels), $free])); }
        elseif ($key === 'event_seeking') { $value = ['role_codes' => $codes]; if ($free !== '') { $value['free_text'] = $free; } }
        elseif ($key === 'event_time_commitment') {
            $hours = ['light' => [1, 2], 'regular' => [3, 5], 'focused' => [6, 8]];
            $value = $codes === [] ? ['period' => 'event'] : ['period' => 'day', 'hours_min' => $hours[$codes[0]][0], 'hours_max' => $hours[$codes[0]][1]];
            if ($free !== '') { $value['note'] = $free; }
        } elseif ($key === 'event_collaboration_mode') {
            if ($codes === []) { return [['key' => 'event_constraint', 'value' => $free]]; }
            $value = ['mode' => $codes[0]]; if ($free !== '') { $value['note'] = $free; }
        } else { $value = ['codes' => $codes]; if ($free !== '') { $value['free_text'] = $free; } }
        return [['key' => $key, 'value' => $value]];
    }
}
