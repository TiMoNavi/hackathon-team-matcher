<?php
declare(strict_types=1);
namespace humhub\modules\matcherOnboardingAi\domain;

use humhub\modules\matcherProfile\domain\FieldCatalog;
use humhub\modules\matcherProfile\domain\ProfileAiFailure;
use humhub\modules\matcherProfile\domain\rules\RuleQuestionProvider;
use humhub\modules\matcherProfile\domain\rules\RulesProfileComposer;

/** Pure boundary: the model chooses suggestions; only the server owns fields, codes and scope. */
final class OutputValidator
{
    public const MAX_INPUT_BYTES = 131072;
    public const MAX_OUTPUT_BYTES = 65536;
    public const FREE_TEXT_OPTION = ['code' => 'other', 'label' => '其他，我来填写', 'position' => 'last', 'max_length' => 1000];
    private const RANK = ['authenticated' => 0, 'friends' => 1, 'private' => 2];

    /** Preserve JSON object/array distinctions before PHP's associative conversion loses them. */
    public function decode(string $operation, string $json): array
    {
        try {
            $data = StrictJson::object($json, self::MAX_OUTPUT_BYTES);
            $typed = json_decode($json, false, 32, JSON_THROW_ON_ERROR);
            $lists = match ($operation) { 'extract' => ['candidates','review_items'], 'questions' => ['questions','review_items'], 'compose' => ['global_fields','space_fields','review_items'], default => throw new \UnexpectedValueException() };
            foreach ($lists as $list) {
                if (!property_exists($typed, $list) || !is_array($typed->{$list})) { $this->fail(); }
                foreach ($typed->{$list} as $item) {
                    if (!$item instanceof \stdClass) { $this->fail(); }
                    if ($list === 'questions') {
                        if (!is_array($item->options ?? null)) { $this->fail(); }
                        foreach ($item->options as $option) { if (!$option instanceof \stdClass) { $this->fail(); } }
                        if (property_exists($item, 'free_text_option') && !$item->free_text_option instanceof \stdClass) { $this->fail(); }
                    } else {
                        if (!is_array($item->evidence ?? null)) { $this->fail(); }
                        foreach ($item->evidence as $ref) { if (!$ref instanceof \stdClass) { $this->fail(); } }
                        if ($list === 'review_items') { if (!is_array($item->field_keys ?? null)) { $this->fail(); } }
                        else {
                            if (!is_string($item->key ?? null) || !isset(FieldCatalog::definitions()[$item->key])) { $this->fail(); }
                            $this->jsonValueTypes($item->value ?? null, FieldCatalog::definitions()[$item->key]['value_schema']);
                        }
                    }
                }
            }
            return $data;
        } catch (\Throwable) { throw new ProfileAiFailure('AI_OUTPUT_INVALID'); }
    }

    private function jsonValueTypes(mixed $value, array $schema): void
    {
        if ($schema['type'] === 'object') {
            if (!$value instanceof \stdClass) { $this->fail(); }
            foreach (get_object_vars($value) as $key => $item) { if (isset($schema['properties'][$key])) { $this->jsonValueTypes($item, $schema['properties'][$key]); } }
        } elseif ($schema['type'] === 'array') {
            if (!is_array($value)) { $this->fail(); }
            foreach ($value as $item) { $this->jsonValueTypes($item, $schema['items']); }
        }
    }

    /** Select only required private data; never pass stored raw files, credentials or request URLs. */
    public function prepare(string $operation, array $input): array
    {
        try {
            if (!in_array($operation, ['extract','questions','compose'], true)) { $this->fail(); }
            $spaceId = $input['space_id'] ?? null;
            if ($spaceId !== null && (!is_int($spaceId) || $spaceId < 1)) { $this->fail(); }
            $out = ['space_id' => $spaceId];
            if ($operation === 'extract') {
                $this->list($input['sources'] ?? null, 1, 8); $out['sources'] = []; $seen = []; $sectionCount = 0;
                foreach ($input['sources'] as $source) {
                    if (!is_array($source)) { $this->fail(); }
                    $this->id($source['source_id'] ?? null); $version = $source['version'] ?? null;
                    if (!is_int($version) || $version < 1 || isset($seen[$source['source_id']])) { $this->fail(); }
                    $seen[$source['source_id']] = true; $this->list($source['sections'] ?? null, 1, 200); $sections = []; $ids = [];
                    foreach ($source['sections'] as $section) {
                        if (!is_array($section)) { $this->fail(); }
                        $this->id($section['id'] ?? null); $this->text($section['text'] ?? null, 32768);
                        if (isset($ids[$section['id']]) || ++$sectionCount > 200) { $this->fail(); }
                        $ids[$section['id']] = true; $sections[] = ['id' => $section['id'], 'text' => $section['text']];
                    }
                    $out['sources'][] = ['source_id' => $source['source_id'], 'version' => $version, 'sections' => $sections];
                }
            } else {
                $out['profiles'] = $this->profiles($input['profiles'] ?? null, $spaceId);
                $out['question_templates'] = (new RuleQuestionProvider())->questions($out['profiles'], $spaceId);
                if ($operation === 'compose') {
                    $out['questions'] = $this->questions($input['questions'] ?? null, $out);
                    $out['answers'] = $this->answers($input['answers'] ?? null, $out['questions']);
                }
            }
            $encoded = json_encode($out, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            if (strlen($encoded) > self::MAX_INPUT_BYTES) { throw new ProfileAiFailure('AI_INPUT_TOO_LARGE'); }
            return $out;
        } catch (ProfileAiFailure $e) { throw new ProfileAiFailure($e->errorCode === 'AI_INPUT_TOO_LARGE' ? $e->errorCode : 'AI_INPUT_INVALID'); }
        catch (\Throwable) { throw new ProfileAiFailure('AI_INPUT_INVALID'); }
    }

    /** Accept prepared or original trusted input. The result is ready for private job storage only. */
    public function validate(string $operation, array $data, array $input): array
    {
        try {
            $input = $this->prepare($operation, $input);
            $required = match ($operation) { 'extract' => ['candidates','review_items'], 'questions' => ['questions','review_items'], 'compose' => ['global_fields','space_fields','review_items'], default => [] };
            $this->object($data, $required, $required);
            if (strlen(json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)) > self::MAX_OUTPUT_BYTES) { $this->fail(); }
            $review = $this->reviews($data['review_items'], $input, $operation);
            if ($operation === 'extract') { return ['candidates' => $this->candidates($data['candidates'], $input), 'review_items' => $review]; }
            if ($operation === 'questions') { return ['questions' => $this->questions($data['questions'], $input), 'review_items' => $review]; }
            $global = $this->fields($data['global_fields'], 'global', $input);
            $space = $this->fields($data['space_fields'], 'space', $input);
            $prose = array_values(array_filter($global, static fn(array $field): bool => in_array($field['key'], ['headline','bio'], true)));
            if ($prose !== []) {
                $refs = [];
                foreach ($prose as $field) { foreach ($field['evidence'] as $ref) { $refs[$this->canonical($ref)] = $ref; } }
                $notice = ['id' => 'server-prose-review', 'kind' => 'uncertain', 'message' => 'AI 改写保留了来源引用，但引用校验不等于事实已核实。请逐句核对并编辑后，再决定是否确认与展示。', 'field_keys' => array_column($prose, 'key'), 'evidence' => array_slice(array_values($refs), 0, 12)];
                $replaced = false;
                foreach ($review as &$item) { if ($item['id'] === $notice['id']) { $item = $notice; $replaced = true; break; } } unset($item);
                if (!$replaced) { if (count($review) >= 32) { $this->fail(); } $review[] = $notice; }
            }
            return ['global_fields' => $global, 'space_fields' => $space, 'review_items' => $review];
        } catch (\Throwable) { throw new ProfileAiFailure('AI_OUTPUT_INVALID'); }
    }

    private function profiles(mixed $profiles, ?int $spaceId): array
    {
        if (!is_array($profiles) || !is_array($profiles['global'] ?? null)) { $this->fail(); }
        $out = []; $total = 0;
        foreach (['global','space'] as $scope) {
            $attributes = $profiles[$scope]['attributes'] ?? [];
            $this->list($attributes, 0, 200); $items = []; $ids = []; $counts = [];
            if ($scope === 'space' && $spaceId === null && $attributes !== []) { $this->fail(); }
            foreach ($attributes as $item) {
                if (!is_array($item) || ++$total > 200) { $this->fail(); }
                $this->id($item['attribute_id'] ?? null);
                if (isset($ids[$item['attribute_id']])) { $this->fail(); } $ids[$item['attribute_id']] = true;
                $definition = $this->field($item['key'] ?? null, $item['value'] ?? null, $scope);
                $counts[$item['key']] = ($counts[$item['key']] ?? 0) + 1;
                if ($counts[$item['key']] > $definition['max_items']) { $this->fail(); }
                if (!in_array($item['visibility'] ?? null, FieldCatalog::VISIBILITIES, true)) { $this->fail(); }
                if (array_key_exists('confirmation', $item) && $item['confirmation'] !== 'confirmed') { $this->fail(); }
                $items[] = ['attribute_id' => $item['attribute_id'], 'key' => $item['key'], 'value' => $item['value'], 'visibility' => $item['visibility']];
            }
            $out[$scope] = ['attributes' => $items];
        }
        return $out;
    }

    private function candidates(mixed $candidates, array $input): array
    {
        $this->list($candidates, 0, 80); $out = []; $ids = []; $counts = []; $values = [];
        foreach ($candidates as $candidate) {
            $this->object($candidate, ['id','key','value','evidence'], ['id','key','value','evidence']); $this->id($candidate['id']);
            if (isset($ids[$candidate['id']])) { $this->fail(); } $ids[$candidate['id']] = true;
            $definition = $this->field($candidate['key'], $candidate['value'], 'global');
            if ($candidate['key'] === 'contact_wechat_qr') { $this->fail(); }
            $counts[$candidate['key']] = ($counts[$candidate['key']] ?? 0) + 1;
            if ($counts[$candidate['key']] > $definition['max_items']) { $this->fail(); }
            $fingerprint = $candidate['key'] . ':' . $this->canonical($candidate['value']);
            if (isset($values[$fingerprint])) { $this->fail(); } $values[$fingerprint] = true;
            $evidence = $this->evidence($candidate['evidence'], $input, 'extract', false);
            $text = implode("\n", array_column($evidence, 'text'));
            if (!$this->grounded($candidate['key'], $candidate['value'], $text)) { $this->fail(); }
            $out[] = $candidate;
        }
        return $out;
    }

    private function questions(mixed $questions, array $input): array
    {
        $this->list($questions, 3, 8); $templates = array_column($input['question_templates'], null, 'id'); $out = []; $ids = [];
        foreach ($questions as $question) {
            $keys = ['id','template_id','target_key','scope','prompt','mode','options','allow_free_text','allow_skip','reason','free_text_option'];
            $this->object($question, $keys, array_diff($keys, ['free_text_option']));
            $this->id($question['id']);
            if (!isset($templates[$question['id']]) || isset($ids[$question['id']])) { $this->fail(); }
            $ids[$question['id']] = true; $template = $templates[$question['id']];
            foreach (['id','template_id','target_key','scope','mode','options','allow_free_text','allow_skip'] as $key) {
                if ($this->canonical($question[$key]) !== $this->canonical($template[$key])) { $this->fail(); }
            }
            $this->text($question['prompt'], 300); $this->text($question['reason'], 400);
            if (array_key_exists('free_text_option', $question) && $this->canonical($question['free_text_option']) !== $this->canonical(self::FREE_TEXT_OPTION)) { $this->fail(); }
            $question['free_text_option'] = self::FREE_TEXT_OPTION; $out[] = $question;
        }
        return $out;
    }

    private function answers(mixed $answers, array $questions): array
    {
        $this->list($answers, count($questions), count($questions)); $lookup = array_column($questions, null, 'id'); $out = []; $seen = [];
        foreach ($answers as $answer) {
            if (!is_array($answer)) { $this->fail(); }
            $this->id($answer['question_id'] ?? null); $id = $answer['question_id'];
            if (!isset($lookup[$id]) || isset($seen[$id])) { $this->fail(); } $seen[$id] = true;
            $type = $answer['answer_type'] ?? null; $codes = $answer['selected_options'] ?? null; $free = $answer['free_text'] ?? null;
            if (!in_array($type, ['options','free_text','skipped'], true)) { $this->fail(); }
            $this->list($codes, 0, 10); $this->text($free, 1000, true); $allowed = array_column($lookup[$id]['options'], 'code');
            foreach ($codes as $code) { if (!is_string($code)) { $this->fail(); } }
            if (count(array_unique($codes, SORT_REGULAR)) !== count($codes) || array_diff($codes, $allowed) !== [] || ($lookup[$id]['mode'] === 'single' && count($codes) > 1)) { $this->fail(); }
            if (($type === 'skipped' && ($codes !== [] || $free !== '')) || ($type === 'free_text' && ($codes !== [] || trim($free) === '')) || ($type === 'options' && $codes === [])) { $this->fail(); }
            $out[] = ['question_id' => $id, 'answer_type' => $type, 'selected_options' => $codes, 'free_text' => $free];
        }
        return $out;
    }

    private function fields(mixed $fields, string $scope, array $input): array
    {
        $this->list($fields, 0, 80);
        if ($scope === 'space' && $input['space_id'] === null && $fields !== []) { $this->fail(); }
        $current = $input['profiles'][$scope]['attributes']; $counts = []; $seen = []; $out = [];
        $baseline = (new RulesProfileComposer())->compose($input['profiles'], $input['questions'], $input['answers']);
        foreach ($fields as $item) {
            $this->object($item, ['key','value','visibility','evidence'], ['key','value','evidence']);
            $definition = $this->field($item['key'], $item['value'], $scope);
            if ($item['key'] === 'contact_wechat_qr' || (array_key_exists('visibility', $item) && !in_array($item['visibility'], FieldCatalog::VISIBILITIES, true))) { $this->fail(); }
            foreach ($current as $existing) {
                if ($existing['key'] === $item['key'] && ($definition['cardinality'] === 'one' || $this->canonical($existing['value']) === $this->canonical($item['value']) || (isset($existing['value']['code'], $item['value']['code']) && $existing['value']['code'] === $item['value']['code']))) { $this->fail(); }
            }
            $counts[$item['key']] = ($counts[$item['key']] ?? 0) + 1;
            $fingerprint = $item['key'] . ':' . $this->canonical($item['value']);
            if ($counts[$item['key']] > $definition['max_items'] || isset($seen[$fingerprint])) { $this->fail(); } $seen[$fingerprint] = true;
            $refs = $this->evidence($item['evidence'], $input, 'compose', false); $visibility = 'authenticated';
            foreach ($refs as $ref) {
                if ($ref['scope'] !== $scope) { $this->fail(); }
                $visibility = $this->strictest($visibility, $ref['visibility']);
            }
            if (in_array($item['key'], ['headline','bio'], true)) {
                // A prose summary may use any supplied global fact. Conservatively inherit them all,
                // even when a model fails to cite one of those facts in its evidence list.
                foreach ($current as $existing) { $visibility = $this->strictest($visibility, $existing['visibility']); }
                if (!$this->hasUsefulEvidence($refs)) { $this->fail(); }
            } else {
                $matching = false;
                foreach ($baseline[$scope . '_fields'] as $allowed) {
                    if ($allowed['key'] === $item['key'] && $this->canonical($allowed['value']) === $this->canonical($item['value'])) { $matching = true; break; }
                }
                if (!$matching || !$this->supportsAnswer($item, $refs, $input)) { $this->fail(); }
            }
            if (isset($item['visibility'])) { $visibility = $this->strictest($visibility, $item['visibility']); }
            $out[] = ['key' => $item['key'], 'value' => $item['value'], 'visibility' => $visibility, 'evidence' => $item['evidence']];
        }
        return $out;
    }

    private function supportsAnswer(array $item, array $refs, array $input): bool
    {
        $questions = array_column($input['questions'], null, 'id'); $answers = array_column($input['answers'], null, 'question_id');
        foreach ($refs as $ref) {
            if (($ref['type'] ?? null) !== 'answer') { continue; }
            $q = $questions[$ref['question_id']]; $answer = $answers[$q['id']];
            $mapping = (new RulesProfileComposer())->compose(['global' => ['attributes' => []], 'space' => ['attributes' => []]], [$q], [$answer]);
            foreach ($mapping[$q['scope'] . '_fields'] as $candidate) { if ($candidate['key'] === $item['key'] && $this->canonical($candidate['value']) === $this->canonical($item['value'])) { return true; } }
        }
        return false;
    }

    private function hasUsefulEvidence(array $refs): bool
    {
        foreach ($refs as $ref) { if (!str_starts_with($ref['key'], 'contact_') && !in_array($ref['key'], ['age_range','mbti'], true)) { return true; } }
        return false;
    }

    private function reviews(mixed $items, array $input, string $operation): array
    {
        $this->list($items, 0, 32); $seen = [];
        foreach ($items as $item) {
            $this->object($item, ['id','kind','message','field_keys','evidence'], ['id','kind','message','field_keys','evidence']);
            $this->id($item['id']); $this->text($item['message'], 600);
            if (isset($seen[$item['id']]) || !in_array($item['kind'], ['missing','conflict','uncertain','unsupported'], true)) { $this->fail(); } $seen[$item['id']] = true;
            $this->list($item['field_keys'], 0, 10);
            foreach ($item['field_keys'] as $key) { if (!is_string($key) || !isset(FieldCatalog::definitions()[$key])) { $this->fail(); } }
            if (count(array_unique($item['field_keys'])) !== count($item['field_keys'])) { $this->fail(); }
            $this->evidence($item['evidence'], $input, $operation, true);
        }
        return $items;
    }

    /** Resolves references against the server snapshot; private source text never enters returned data. */
    private function evidence(mixed $references, array $input, string $operation, bool $allowEmpty): array
    {
        $this->list($references, $allowEmpty ? 0 : 1, 12); $out = []; $seen = [];
        foreach ($references as $reference) {
            if (!is_array($reference)) { $this->fail(); }
            $fingerprint = $this->canonical($reference);
            if (isset($seen[$fingerprint])) { $this->fail(); } $seen[$fingerprint] = true;
            if ($operation === 'extract') {
                $this->object($reference, ['source_id','source_version','section_id'], ['source_id','source_version','section_id']);
                $this->id($reference['source_id']); $this->id($reference['section_id']);
                if (!is_int($reference['source_version'])) { $this->fail(); }
                $found = null;
                foreach ($input['sources'] as $source) { if ($source['source_id'] !== $reference['source_id'] || $source['version'] !== $reference['source_version']) { continue; } foreach ($source['sections'] as $section) { if ($section['id'] === $reference['section_id']) { $found = ['text' => $section['text']]; break; } } }
                if ($found === null) { $this->fail(); } $out[] = $found; continue;
            }
            $type = $reference['type'] ?? null;
            if ($type === 'profile') {
                $this->object($reference, ['type','scope','attribute_id'], ['type','scope','attribute_id']); $this->id($reference['attribute_id']);
                if (!in_array($reference['scope'], ['global','space'], true)) { $this->fail(); }
                $found = null;
                foreach ($input['profiles'][$reference['scope']]['attributes'] as $attribute) { if ($attribute['attribute_id'] === $reference['attribute_id']) { $found = $reference + $attribute; } }
                if ($found === null) { $this->fail(); } $out[] = $found;
            } elseif ($type === 'answer' && $operation === 'compose') {
                $this->object($reference, ['type','question_id'], ['type','question_id']); $this->id($reference['question_id']);
                $questions = array_column($input['questions'], null, 'id'); $answers = array_column($input['answers'], null, 'question_id');
                $question = $questions[$reference['question_id']] ?? null; $answer = $answers[$reference['question_id']] ?? null;
                if ($question === null || $answer === null || $answer['answer_type'] === 'skipped') { $this->fail(); }
                $visibility = 'authenticated';
                foreach ($input['profiles'][$question['scope']]['attributes'] as $attribute) { if ($attribute['key'] === $question['target_key']) { $visibility = $this->strictest($visibility, $attribute['visibility']); } }
                $out[] = $reference + ['scope' => $question['scope'], 'key' => $question['target_key'], 'visibility' => $visibility];
            } else { $this->fail(); }
        }
        return $out;
    }

    /** Literal support prevents novel facts/traits. It is evidence alignment, not truth verification. */
    private function grounded(string $key, mixed $value, string $text): bool
    {
        if ($key === 'personality' && !preg_match('/性格|自述|自我描述|做事风格|我(?:是|很|比较)|I am|my (?:personality|style)/iu', $text)) { return false; }
        if ($key === 'mbti' && !preg_match('/MBTI|人格类型/iu', $text)) { return false; }
        if ($key === 'age_range') { return mb_stripos($text, FieldCatalog::AGE_RANGES[$value] ?? "\0", 0, 'UTF-8') !== false; }
        return $this->supportedLeaves($value, $text);
    }

    private function supportedLeaves(mixed $value, string $text, ?string $key = null, ?array $parent = null): bool
    {
        if (is_array($value)) { foreach ($value as $childKey => $child) { if (!$this->supportedLeaves($child, $text, is_string($childKey) ? $childKey : null, $value)) { return false; } } return true; }
        if ($key === 'precision') { return true; }
        if ($key === 'code' && isset($parent['label'])) { return $this->validLabelCode($value, $parent['label']); }
        if ($key === 'self_level') {
            $labels = ['learning' => ['learning','学习中'], 'working' => ['working','工作使用'], 'proficient' => ['proficient','熟练'], 'expert' => ['expert','专家'], 'basic' => ['basic','基础'], 'conversational' => ['conversational','日常交流'], 'fluent' => ['fluent','流利'], 'native' => ['native','母语']];
            foreach ($labels[$value] ?? [] as $label) { if (mb_stripos($text, $label, 0, 'UTF-8') !== false) { return true; } } return false;
        }
        return (is_string($value) || is_int($value) || is_float($value)) && mb_stripos($text, (string)$value, 0, 'UTF-8') !== false;
    }

    private function validLabelCode(mixed $code, mixed $label): bool
    {
        if (!is_string($code) || !is_string($label) || !preg_match('/^[a-z0-9][a-z0-9_.:-]{0,63}$/D', $code)) { return false; }
        $slug = trim(preg_replace('/[^a-z0-9]+/', '_', strtolower($label)), '_');
        if (($slug !== '' && $code === $slug) || $code === 'self_' . substr(hash('sha256', $label), 0, 16)) { return true; }
        foreach ((new RuleQuestionProvider())->questions(['global' => ['attributes' => []], 'space' => ['attributes' => []]], 1) as $question) { foreach ($question['options'] as $option) { if ($option['code'] === $code && $option['label'] === $label) { return true; } } }
        return false;
    }

    private function field(mixed $key, mixed $value, string $scope): array
    {
        if (!is_string($key) || !isset(FieldCatalog::definitions()[$key]) || $value === null) { $this->fail(); }
        $definition = FieldCatalog::definitions()[$key];
        if ($definition['scope'] !== ($scope === 'space' ? 'event' : 'global') || FieldCatalog::validate($key, $value) !== []) { $this->fail(); }
        return $definition;
    }
    private function strictest(string $a, string $b): string { return self::RANK[$a] >= self::RANK[$b] ? $a : $b; }
    private function canonical(mixed $value): string
    { $sort = static function (mixed $v) use (&$sort): mixed { if (!is_array($v)) { return $v; } if (!array_is_list($v)) { ksort($v); } return array_map($sort, $v); }; return json_encode($sort($value), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR); }
    private function object(mixed $value, array $allowed, array $required): void
    { if (!is_array($value) || array_is_list($value) || array_diff(array_keys($value), $allowed) !== [] || array_diff($required, array_keys($value)) !== []) { $this->fail(); } }
    private function list(mixed $value, int $min, int $max): void
    { if (!is_array($value) || !array_is_list($value) || count($value) < $min || count($value) > $max) { $this->fail(); } }
    private function id(mixed $id): void { if (!is_string($id) || !preg_match('/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/D', $id)) { $this->fail(); } }
    private function text(mixed $text, int $max, bool $empty = false): void
    { if (!is_string($text) || !mb_check_encoding($text, 'UTF-8') || (!$empty && trim($text) === '') || mb_strlen($text, 'UTF-8') > $max || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', $text)) { $this->fail(); } }
    private function fail(): never { throw new ProfileAiFailure('AI_OUTPUT_INVALID'); }
}
