<?php
declare(strict_types=1);
require dirname(__DIR__, 6) . '/backend/deploy/profile_s73_people_validate.php';
s73PeopleRegisterAutoload();
use humhub\modules\matcherProfile\domain\FieldCatalog;
$checks = [];
function check(bool $condition, string $name): void { global $checks; if (!$condition) { throw new RuntimeException($name); } $checks[] = $name; }
$before = FieldCatalog::definitions();
check(count($before) === 37, 'all 37 editable field definitions remain available');
$copy = FieldCatalog::definitions();
$copy['skill']['value_schema']['properties']['code']['maxLength'] = 1;
$copy['skill']['visibility_choices'][] = 'forbidden';
unset($copy['event_availability']);
check(FieldCatalog::definitions() === $before, 'mutating returned nested schema cannot alter later definitions');
$field = FieldCatalog::get('skill'); $field['value_schema']['properties']['code']['maxLength'] = 1;
check(FieldCatalog::get('skill') === $before['skill'], 'mutating get result cannot alter shared catalog');
check(FieldCatalog::validate('skill', ['code' => 'rust', 'label' => 'Rust']) === [], 'valid public skill still passes validation');
check(FieldCatalog::validate('skill', ['code' => str_repeat('x', 65), 'label' => 'Synthetic']) !== [], 'too-long skill still fails validation');
check(FieldCatalog::validate('event_seeking', ['role_codes' => ['qa', 'backend', 'designer'], 'skill_codes' => ['rust', 'php']]) === [], 'all array items remain validated');
check(FieldCatalog::validate('event_seeking', ['role_codes' => ['qa', 'backend', true]]) !== [], 'invalid later array item still fails');
check(FieldCatalog::validate('event_availability', ['starts_at' => '2026-11-28T03:00:00Z', 'ends_at' => '2026-11-28T05:00:00Z', 'timezone' => 'Asia/Shanghai']) === [], 'valid availability interval still passes');
check(FieldCatalog::definitions() === $before, 'validation does not mutate immutable schema');
echo json_encode(['status' => 'passed', 'checks' => count($checks), 'checks_passed' => $checks, 'catalog_sha256' => hash('sha256', json_encode($before, JSON_THROW_ON_ERROR)), 'model_calls' => 0], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR), PHP_EOL;
