<?php
declare(strict_types=1);

// No HumHub bootstrap, database, network or model provider is required.
$moduleRoot = dirname(__DIR__, 2);
spl_autoload_register(static function (string $class) use ($moduleRoot): void {
    $prefix = 'humhub\modules\matcherProfile' . chr(92);
    if (str_starts_with($class, $prefix)) {
        $file = $moduleRoot . '/' . str_replace(chr(92), '/', substr($class, strlen($prefix))) . '.php';
        if (is_file($file)) { require $file; }
    }
});

use humhub\modules\matcherProfile\application\GetDisplayName;
use humhub\modules\matcherProfile\domain\DisplayName;
use humhub\modules\matcherProfile\domain\FieldCatalog;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\matcherProfile\domain\RelationAccessContext;
use humhub\modules\matcherProfile\domain\ports\ConfirmedIdentityReader;

$checks = 0;
function check(bool $condition, string $label): void
{
    global $checks;
    ++$checks;
    if (!$condition) { throw new RuntimeException('FAILED: ' . $label); }
}
function rejects(callable $action, string $label): void
{
    try { $action(); } catch (InvalidArgumentException) { check(true, $label); return; }
    check(false, $label);
}

$fields = FieldCatalog::definitions();
check(count($fields) === 37, '27 global and 10 Space fields');
check(count(array_filter($fields, fn($d) => $d['scope'] === 'global')) === 27, 'global scope catalog');
check(count(FieldCatalog::nativeFields()) === 4, 'four native additions');
check(!isset($fields['nickname'], $fields['activities']), 'identity and relationship fields are not ordinary edits');
foreach ($fields as $field) {
    check($field['default_visibility'] === 'authenticated', 'new confirmed ordinary fields default authenticated');
    check($field['scope'] !== 'event' || $field['storage_kind'] === 'inline', 'activity fields cannot reuse global columns');
}

check(FieldCatalog::validate('nickname', '小明') === [], 'Unicode nickname');
check(FieldCatalog::validate('nickname', 'a') !== [], 'nickname minimum length');
check(FieldCatalog::validate('nickname', "A\nB") !== [], 'nickname control characters rejected at confirmation');
check(FieldCatalog::validate('nickname', null) !== [], 'confirmed identity needs nickname');
check(FieldCatalog::validate('nickname', null, false) === [], 'unfinished draft may omit nickname');
check(FieldCatalog::validate('headline', str_repeat('中', 160)) === [], 'Unicode headline length');
check(FieldCatalog::validate('headline', str_repeat('中', 161)) !== [], 'headline maximum length');
check(FieldCatalog::validateNativeNameParts(str_repeat('名', 119), '') === [], 'full name mode');
check(FieldCatalog::validateNativeNameParts(str_repeat('名', 60), str_repeat('姓', 60)) !== [], 'combined name includes separator');
check(FieldCatalog::validate('mbti', 'INFP') === [], 'known self-reported MBTI');
check(FieldCatalog::validate('mbti', 'UNCLASSIFIED') !== [], 'unknown MBTI is omitted, not invented');
check(FieldCatalog::validate('age_range', null) === [], 'age is optional');
check(FieldCatalog::validate('personality', []) !== [], 'empty personality is not confirmed');
check(FieldCatalog::validate('personality', ['traits' => []]) !== [], 'empty traits are not a portrait');
check(FieldCatalog::validate('personality', [], false) === [], 'empty personality draft can be saved');
check(FieldCatalog::validate('personality', ['traits' => ['喜欢先做原型'], 'self_description' => '遇到不确定问题会先讨论再动手']) === [], 'self-described work style');
check(FieldCatalog::validate('personality', ['inferred_score' => 90]) !== [], 'unknown inferred personality data rejected');
check(FieldCatalog::validate('skill', ['code' => 'php', 'label' => 'PHP']) === [], 'one skill per stable item');
check(FieldCatalog::validate('skill', ['label' => 'PHP']) !== [], 'confirmed skill needs stable code');
check(FieldCatalog::validate('collaboration_preference', ['codes' => ['async', 'async']]) !== [], 'duplicate choices rejected');
check(FieldCatalog::validate('timezone', 'Asia/Shanghai') === [], 'named timezone');
check(FieldCatalog::validate('timezone', 'MadeUp/Nowhere') !== [], 'unknown timezone rejected');
check(FieldCatalog::validate('portfolio_link', ['url' => 'https://example.org/demo', 'label' => '项目演示']) === [], 'public proof link');
check(FieldCatalog::validate('portfolio_link', ['url' => 'javascript:alert(1)', 'label' => 'bad']) !== [], 'executable URL rejected');
check(FieldCatalog::validate('project', ['title' => '合成演示', 'start' => ['value' => '2024-02', 'precision' => 'month']]) === [], 'date precision retained');
check(FieldCatalog::validate('project', ['title' => '合成演示', 'start' => ['value' => '2024-02', 'precision' => 'day']]) !== [], 'date precision mismatch rejected');
check(FieldCatalog::validate('award', ['title' => '合成奖项', 'date' => ['value' => '2025-02-29', 'precision' => 'day']]) !== [], 'invalid calendar day rejected');
check(FieldCatalog::validate('event_time_commitment', ['period' => 'event', 'hours_min' => 1, 'hours_max' => 240]) === [], 'multiweek event not capped at one week');
check(FieldCatalog::validate('event_time_commitment', ['period' => 'day', 'hours_max' => 25]) !== [], 'day bound');
check(FieldCatalog::validate('event_time_commitment', ['period' => 'week', 'hours_max' => 169]) !== [], 'week bound');
check(FieldCatalog::validate('event_time_commitment', ['period' => 'event', 'hours_min' => 10, 'hours_max' => 9]) !== [], 'ordered time range');
check(FieldCatalog::validate('event_time_commitment', ['period' => 'event', 'hours_min' => INF]) !== [], 'finite time values');
$availability = ['starts_at' => '2026-11-11T10:00:00+08:00', 'ends_at' => '2026-11-11T12:00:00+08:00', 'timezone' => 'Asia/Shanghai'];
check(FieldCatalog::validate('event_availability', $availability) === [], 'complete availability');
check(FieldCatalog::validate('event_availability', [...$availability, 'ends_at' => '2026-11-11T09:00:00+08:00']) !== [], 'availability ordered');
check(FieldCatalog::validate('event_availability', [...$availability, 'starts_at' => '2026-02-30T10:00:00+08:00']) !== [], 'timestamp calendar validity');

$skill = ['key' => 'skill', 'value' => ['code' => 'php', 'label' => 'PHP'], 'visibility' => 'friends'];
check(FieldCatalog::validateAttributeSet([$skill, [...$skill, 'value' => ['code' => 'ux', 'label' => 'UX']]], ProfileScope::global()) === [], 'multiple independent skills');
check(FieldCatalog::validateAttributeSet([['key' => 'headline', 'value' => 'A'], ['key' => 'headline', 'value' => 'B']], ProfileScope::global()) !== [], 'single-value cardinality');
check(FieldCatalog::validateAttributeSet([$skill], ProfileScope::event(3)) !== [], 'global skill cannot become activity field');
check(FieldCatalog::validateAttributeSet([['key' => 'activities', 'value' => ['private group']]], ProfileScope::global()) !== [], 'relation injection rejected');
check(FieldCatalog::validateAttributeSet([[...$skill, 'visibility' => 'everyone']], ProfileScope::global()) !== [], 'visibility enum');
check(ProfileScope::event(3)->key() === 'space:3', 'server-generated scope key');
rejects(fn() => ProfileScope::event(0), 'invalid space scope rejected');
rejects(fn() => new RelationAccessContext(2, 1, 'self', '2', null), 'self must match owner');
rejects(fn() => new RelationAccessContext(2, 1, 'event_card', 'card', null), 'activity context required');
check((new RelationAccessContext(2, 1, 'public_post', 'post', null))->currentSpaceId === null, 'public-post entry does not invent same-activity requirement');

$guid = '00000000-0000-4000-8000-0000aabbccdd';
check(DisplayName::resolve($guid, '昵称', 1, true) === '昵称', 'confirmed identity');
check(DisplayName::resolve($guid, '姓名未确认', 1, false) === '成员·aabbccdd', 'avatar confirmation alone never confirms nickname');
check(DisplayName::resolve($guid, '昵称', 0, true) === '成员·aabbccdd', 'version required');
check(DisplayName::resolve($guid, 'x', 1, true) === '成员·aabbccdd', 'invalid nickname stays neutral');
check(DisplayName::resolve($guid, null, 0, false) === '成员·aabbccdd', 'legacy identity stays neutral');
check(DisplayName::resolve($guid, "A\nB", 1, true) === '成员·aabbccdd', 'control characters not displayed');
$memoryReader = new class implements ConfirmedIdentityReader {
    public function read(int $ownerId): array { return ['nickname' => '合成昵称', 'identity_version' => 2, 'confirmed' => $ownerId === 7]; }
};
check((new GetDisplayName($memoryReader))->execute(7, $guid) === '合成昵称', 'use case runs through memory adapter');
check((new GetDisplayName($memoryReader))->execute(8, $guid) === '成员·aabbccdd', 'adapter confirmation respected');

echo json_encode(['status' => 'passed', 'checks' => $checks, 'database_calls' => 0, 'model_calls' => 0], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . PHP_EOL;
