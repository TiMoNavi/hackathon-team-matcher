<?php
/** Offline validation using the actual P1 field catalog and owner profile use cases. */
declare(strict_types=1);

function s73PeopleRegisterAutoload(): void
{
    $moduleRoot = dirname(__DIR__) . '/protected/modules/matcher-user-profile';
    spl_autoload_register(static function (string $class) use ($moduleRoot): void {
        $prefix = implode(chr(92), ['humhub', 'modules', 'matcherProfile']) . chr(92);
        if (str_starts_with($class, $prefix)) {
            $file = $moduleRoot . '/' . str_replace(chr(92), '/', substr($class, strlen($prefix))) . '.php';
            if (is_file($file)) { require_once $file; }
        }
    });
}

final class S73PeopleGuardException extends RuntimeException {}

function s73PeopleAssert(bool $condition, string $message): void
{
    if (!$condition) { throw new S73PeopleGuardException($message); }
}

function s73PeopleReadDataset(string $path): array
{
    s73PeopleRegisterAutoload();
    $raw = file_get_contents($path);
    s73PeopleAssert(is_string($raw), 'Dataset is not readable.');
    $data = json_decode($raw, true, 128, JSON_THROW_ON_ERROR);
    s73PeopleAssert(($data['dataset_id'] ?? null) === 's73-people_2026-11-12' && ($data['synthetic'] ?? null) === true && ($data['schema_version'] ?? null) === 1, 'Only the fixed synthetic S7.3 dataset is accepted.');
    s73PeopleAssert(($data['field_catalog_version'] ?? null) === humhub\modules\matcherProfile\domain\FieldCatalog::VERSION, 'Dataset catalog version differs from installed P1.');
    s73PeopleAssert(count($data['people'] ?? []) === 400 && array_is_list($data['people']), 'Dataset must contain exactly 400 people.');
    s73PeopleAssert(array_keys($data['spaces'] ?? []) === ['primary', 'secondary'], 'Exactly two explicit Space aliases are required.');
    $statistics = ['people' => 400, 'space_members' => ['primary' => 0, 'secondary' => 0], 'discoverable' => ['primary' => 0, 'secondary' => 0], 'confirmed_attributes' => 0, 'draft_attributes' => 0, 'visibility' => [], 'field_counts' => []];
    $names = []; $bios = []; $projects = []; $rare = [];
    foreach ($data['people'] as $index => $person) {
        $number = $index + 1; $key = sprintf('s73_sim_%03d', $number);
        s73PeopleAssert(($person['number'] ?? null) === $number && ($person['fixture_key'] ?? null) === $key && ($person['username'] ?? null) === $key && ($person['email'] ?? null) === $key . '@example.invalid' && ($person['synthetic'] ?? null) === true, 'Invalid synthetic identity at person ' . $number . '.');
        s73PeopleAssert(str_starts_with($person['nickname'] ?? '', '模拟·') && humhub\modules\matcherProfile\domain\FieldCatalog::validate('nickname', $person['nickname']) === [], 'Invalid explicit synthetic nickname.');
        s73PeopleAssert(!isset($names[$person['nickname']]), 'Nickname must be unique.'); $names[$person['nickname']] = true;
        s73PeopleAssert(array_keys($person['spaces']) === ($number >= 321 ? ['primary', 'secondary'] : ['primary']), 'Secondary membership must be limited to people 321–400.');
        foreach (['global' => $person['global']] + $person['spaces'] as $alias => $block) {
            $scope = $alias === 'global' ? humhub\modules\matcherProfile\domain\ProfileScope::global() : humhub\modules\matcherProfile\domain\ProfileScope::event($alias === 'primary' ? 1 : 2);
            if ($alias !== 'global') {
                s73PeopleAssert(is_bool($block['discoverable'] ?? null), 'Discovery consent must be explicit boolean.');
                ++$statistics['space_members'][$alias]; $statistics['discoverable'][$alias] += (int)$block['discoverable'];
                $expected = !in_array($number, $alias === 'primary' ? [...range(10, 390, 10), 399] : [...range(330, 390, 10), 399], true);
                s73PeopleAssert($block['discoverable'] === $expected, 'Discovery boundary fixture changed.');
            }
            foreach (['attributes', 'draft_attributes'] as $kind) {
                s73PeopleAssert(is_array($block[$kind] ?? null) && array_is_list($block[$kind]), 'Profile values must be lists.');
                $errors = humhub\modules\matcherProfile\domain\FieldCatalog::validateAttributeSet($block[$kind], $scope, true);
                s73PeopleAssert($errors === [], 'P1 FieldCatalog validation failed for ' . $key . '/' . $alias . '/' . $kind . ': ' . implode('; ', $errors));
                foreach ($block[$kind] as $attribute) {
                    s73PeopleAssert(array_keys($attribute) === ['key', 'value', 'visibility'], 'Only ordinary P1 values and explicit visibility are accepted.');
                    s73PeopleAssert(!in_array($attribute['key'], ['contact_phone', 'contact_qq', 'contact_wechat', 'contact_wechat_qr'], true), 'Do not fabricate real-looking account identifiers.');
                    $checkValue = function (mixed $value) use (&$checkValue): void {
                        if (is_array($value)) { foreach ($value as $part) { $checkValue($part); } return; }
                        if (!is_string($value)) { return; }
                        if (str_starts_with($value, 'http')) { s73PeopleAssert(parse_url($value, PHP_URL_HOST) === 'example.org', 'Only example.org links are allowed.'); }
                        if (str_contains($value, '@')) { s73PeopleAssert(str_ends_with($value, '@example.invalid'), 'Only example.invalid addresses are allowed.'); }
                    };
                    $checkValue($attribute['value']);
                    if ($kind === 'attributes') {
                        ++$statistics['confirmed_attributes'];
                        $statistics['visibility'][$attribute['visibility']] = ($statistics['visibility'][$attribute['visibility']] ?? 0) + 1;
                        $statistics['field_counts'][$attribute['key']] = ($statistics['field_counts'][$attribute['key']] ?? 0) + 1;
                    } else { ++$statistics['draft_attributes']; }
                    if ($attribute['key'] === 'bio') { s73PeopleAssert(str_contains($attribute['value'], '虚构') && str_contains($attribute['value'], '模拟'), 'Every biography must be marked fictional.'); $bios[] = $attribute['value']; }
                    if ($kind === 'attributes' && $attribute['key'] === 'project') { $projects[] = $attribute['value']['title']; }
                    if ($attribute['key'] === 'skill' && ($attribute['value']['code'] ?? null) === 's73-wasm-component-model') { $rare[] = [$number, $alias, $kind, $attribute['visibility']]; }
                }
            }
        }
        if ($number >= 321) { s73PeopleAssert($person['spaces']['primary']['attributes'] !== $person['spaces']['secondary']['attributes'], 'Second Space needs independent preferences.'); }
    }
    ksort($statistics['visibility']); ksort($statistics['field_counts']);
    s73PeopleAssert($statistics == $data['statistics'], 'Dataset statistics do not reconcile.');
    s73PeopleAssert($statistics['space_members'] === ['primary' => 400, 'secondary' => 80] && $statistics['discoverable'] === ['primary' => 360, 'secondary' => 72], 'Membership/consent counts do not reconcile.');
    s73PeopleAssert(count(array_unique($bios)) === 400 && count(array_unique($projects)) === 400, 'Every person needs a distinct biography and project.');
    s73PeopleAssert($rare === [[400, 'global', 'attributes', 'authenticated']], 'The last person must own the only confirmed public rare skill.');
    return [$data, ['dataset_id' => $data['dataset_id'], 'sha256' => hash('sha256', $raw)] + $statistics];
}

/** Shared exact owner workflow; never writes P1 storage JSON or confirmation columns directly. */
function s73PeoplePopulateProfile(object $service, int $ownerId, humhub\modules\matcherProfile\domain\ProfileScope $scope, array $block): array
{
    $draft = $service->startDraft($ownerId, $ownerId, $scope, 'manual', false);
    $draft = $service->updateDraft($ownerId, $ownerId, $scope, $draft['id'], $draft['draft_version'], $block['attributes']);
    $receipt = $service->confirmDraft($ownerId, $ownerId, $scope, $draft['id'], $draft['draft_version'], $draft['base_revision']);
    s73PeopleAssert(count($receipt['profile']['attributes']) === count($block['attributes']), 'Confirmation count differs from fixture.');
    if ($block['draft_attributes'] !== []) {
        $pending = $service->startDraft($ownerId, $ownerId, $scope, 'manual', false);
        $pending = $service->updateDraft($ownerId, $ownerId, $scope, $pending['id'], $pending['draft_version'], $block['draft_attributes']);
        s73PeopleAssert($pending['status'] === 'editing' && count($pending['fields']) === count($block['draft_attributes']), 'Pending fixture must remain an unconfirmed draft.');
    }
    return ['confirmed_count' => count($receipt['profile']['attributes']), 'draft_count' => count($block['draft_attributes']), 'revision' => $receipt['profile']['revision']];
}

function s73PeopleValidateOwnerWorkflows(array $data): int
{
    $count = 0;
    foreach ($data['people'] as $person) {
        $repo = new humhub\modules\matcherProfile\adapters\memory\InMemoryProfileRepository();
        $access = new humhub\modules\matcherProfile\adapters\memory\InMemoryProfileAccessPolicy();
        $access->users = [$person['number']]; $access->memberships = [1 => [$person['number']], 2 => [$person['number']]];
        $service = new humhub\modules\matcherProfile\application\ProfileService($repo, $access);
        foreach (['global' => $person['global']] + $person['spaces'] as $alias => $block) {
            $scope = $alias === 'global' ? humhub\modules\matcherProfile\domain\ProfileScope::global() : humhub\modules\matcherProfile\domain\ProfileScope::event($alias === 'primary' ? 1 : 2);
            s73PeoplePopulateProfile($service, $person['number'], $scope, $block); ++$count;
            $profile = $service->getProfile($person['number'], $person['number'], $scope);
            s73PeopleAssert(count($profile['attributes']) === count($block['attributes']), 'Unconfirmed fields leaked into current profile.');
            foreach ($profile['attributes'] as $attribute) { s73PeopleAssert($attribute['confirmation'] === 'confirmed', 'Confirmed fixture did not use ordinary confirmation.'); }
        }
    }
    return $count;
}

/** Compare production PHP matching with the independent dataset Python oracle. */
function s73PeopleValidateOracle(array $data): array
{
    $directory = dirname(__DIR__) . '/protected/modules/matcher-recommendation/domain/browse';
    require_once $directory . '/DiscoveryException.php';
    require_once $directory . '/OrdinaryDiscoveryQuery.php';
    s73PeopleAssert(is_array($data['oracle_cases'] ?? null) && count($data['oracle_cases']) === 63, 'The fixed independent oracle matrix is required.');
    $comparisons = 0;
    foreach ($data['oracle_cases'] as $case) {
        $query = new humhub\modules\matcherRecommendation\domain\browse\OrdinaryDiscoveryQuery($case['filters'], 'relevance');
        $numbers = []; $scores = [];
        foreach ($data['people'] as $person) {
            $space = $person['spaces'][$case['space_alias']] ?? null;
            if ($space === null || !$space['discoverable']) { continue; }
            $card = [];
            foreach (['global' => $person['global'], 'space' => $space] as $key => $block) {
                $card[$key] = ['attributes' => array_values(array_filter($block['attributes'], static fn(array $a): bool => $a['visibility'] === 'authenticated'))];
            }
            ++$comparisons; $score = $query->match($card);
            if ($score !== null) { $numbers[] = $person['number']; $scores[$person['number']] = $score; }
        }
        s73PeopleAssert($numbers === $case['expected_numbers'] && $scores === $case['expected_scores'], 'Production matching differs from the independent Python oracle: ' . $case['id']);
    }
    return ['oracle_cases' => count($data['oracle_cases']), 'production_match_comparisons' => $comparisons];
}

if (PHP_SAPI === 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    try {
        [$data, $summary] = s73PeopleReadDataset(dirname(__DIR__, 2) . '/docs/用户画像收集/examples/s73-people_2026-11-12.json');
        $summary['owner_workflows'] = s73PeopleValidateOwnerWorkflows($data);
        $summary += s73PeopleValidateOracle($data);
        echo json_encode(['status' => 'passed', 'database_connections' => 0, 'network_requests' => 0, 'llm_calls' => 0] + $summary, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), PHP_EOL;
    } catch (Throwable $error) { fwrite(STDERR, json_encode(['status' => 'failed', 'type' => get_class($error), 'reason' => $error->getMessage()], JSON_UNESCAPED_UNICODE) . PHP_EOL); exit(1); }
}
