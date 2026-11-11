<?php
declare(strict_types=1);
/** Independent in-memory S7.2 selection audit; no runtime config, database or network. */
$modules = dirname(__DIR__, 2);
spl_autoload_register(static function (string $class) use ($modules): void {
    foreach (['matcherProfile' => 'matcher-user-profile', 'matcherPrivacy' => 'matcher-profile-privacy'] as $ns => $directory) {
        $prefix = 'humhub\\modules\\' . $ns . '\\';
        if (str_starts_with($class, $prefix)) { $path = $modules . '/' . $directory . '/' . str_replace(chr(92), '/', substr($class, strlen($prefix))) . '.php'; if (is_file($path)) { require $path; } }
    }
});
use humhub\modules\matcherProfile\application\{ProfileService, ProfilePresentationService};
use humhub\modules\matcherProfile\adapters\memory\{InMemoryProfileRepository, InMemoryProfileAccessPolicy, InMemoryProfileResourcePolicy, InMemoryProfilePresentationRepository};
use humhub\modules\matcherProfile\domain\{ProfileScope, ProfileException};
use humhub\modules\matcherPrivacy\domain\VisibilityPolicy;
$checks = [];
function auditCheck(bool $ok, string $name): void { global $checks; if (!$ok) { throw new RuntimeException('FAIL: ' . $name); } $checks[] = $name; }
function auditReject(callable $action, int $status, string $name): void { try { $action(); } catch (ProfileException $e) { auditCheck($e->httpStatus === $status, $name); return; } auditCheck(false, $name); }
function confirm(ProfileService $profiles, int $owner, array $ops): array { $scope = ProfileScope::global(); $d = $profiles->startDraft($owner, $owner, $scope, 'manual', false); $d = $profiles->updateDraft($owner, $owner, $scope, $d['id'], $d['draft_version'], $ops); return $profiles->confirmDraft($owner, $owner, $scope, $d['id'], $d['draft_version'], $d['base_revision'])['profile']; }
function attributeOf(array $p, string $key, int $offset = 0): array { return array_values(array_filter($p['attributes'], static fn(array $a): bool => $a['key'] === $key))[$offset]; }
$repo = new InMemoryProfileRepository(); $access = new InMemoryProfileAccessPolicy(); $access->users = [1, 2];
$profiles = new ProfileService($repo, $access, new InMemoryProfileResourcePolicy());
$settings = new InMemoryProfilePresentationRepository(); $service = new ProfilePresentationService($repo, $settings, $access);
$owner = confirm($profiles, 1, [
    ['key' => 'education', 'value' => ['school' => 'Synthetic public school']],
    ['key' => 'education', 'value' => ['school' => 'Synthetic private school'], 'visibility' => 'private'],
    ['key' => 'portfolio_link', 'value' => ['url' => 'https://example.org/one', 'label' => 'Synthetic first work']],
    ['key' => 'portfolio_link', 'value' => ['url' => 'https://example.org/two', 'label' => 'Synthetic second work'], 'visibility' => 'friends'],
    ['key' => 'contact_email', 'value' => 'synthetic@example.invalid'],
]);
$school = attributeOf($owner, 'education')['attribute_id']; $privateSchool = attributeOf($owner, 'education', 1)['attribute_id']; $firstLink = attributeOf($owner, 'portfolio_link')['attribute_id']; $friendLink = attributeOf($owner, 'portfolio_link', 1)['attribute_id'];
$settings->nativePrimaryIds[1] = $firstLink;
$other = confirm($profiles, 2, [['key' => 'education', 'value' => ['school' => 'Other synthetic school']]]);
auditCheck($service->read(1) === ['version' => 0, 'education_attribute_id' => null, 'primary_portfolio_attribute_id' => $firstLink], 'missing preference preserves existing native primary only as initial choice');
$saved = $service->save(1, 0, $school, $friendLink);
auditCheck($saved === ['version' => 1, 'education_attribute_id' => $school, 'primary_portfolio_attribute_id' => $friendLink], 'confirmed education and chosen portfolio store references with version one');
auditReject(fn() => $service->save(1, 0, null, null), 409, 'stale first-save version cannot overwrite explicit selections');
auditReject(fn() => $service->save(1, -1, null, null), 422, 'negative expected version is invalid');
auditReject(fn() => $service->save(1, 1, $firstLink, $school), 422, 'confirmed references must match the exact field kind');
auditReject(fn() => $service->save(1, 1, attributeOf($other, 'education')['attribute_id'], $firstLink), 422, 'another owner education cannot become school overview');
$draft = $profiles->startDraft(1, 1, ProfileScope::global(), 'manual', false);
$draft = $profiles->updateDraft(1, 1, ProfileScope::global(), $draft['id'], $draft['draft_version'], [['key' => 'education', 'value' => ['school' => 'Pending synthetic school']]]);
$pending = array_values(array_filter($draft['fields'], static fn(array $a): bool => ($a['value']['school'] ?? '') === 'Pending synthetic school'))[0]['attribute_id'];
auditReject(fn() => $service->save(1, 1, $pending, $firstLink), 422, 'unconfirmed draft education cannot be selected');
auditCheck($service->read(1) === $saved, 'rejected selections do not advance settings version');
$saved = $service->save(1, 1, $privateSchool, null);
auditCheck($saved['education_attribute_id'] === $privateSchool && $saved['primary_portfolio_attribute_id'] === null, 'owner may select private school while explicit null clears primary link');
auditCheck($service->read(1)['primary_portfolio_attribute_id'] === null, 'explicit null never reverts to native homepage default');
$policy = new VisibilityPolicy();
foreach (['authenticated', 'friends'] as $perspective) {
    $projected = $policy->project($owner, $perspective); $json = json_encode($projected);
    auditCheck(!str_contains($json, 'Synthetic private school'), $perspective . ' projection hides private education');
    auditCheck(!str_contains($json, 'synthetic@example.invalid') && !in_array('contact_email', array_column($projected['attributes'], 'key'), true), $perspective . ' ordinary overview source strips contact values and field definitions');
    auditCheck(in_array($friendLink, array_column($projected['attributes'], 'attribute_id'), true) === ($perspective === 'friends'), $perspective . ' detail projection uses actual friends scope for portfolio');
}
auditCheck(!in_array($friendLink, array_column($policy->project($owner, 'friends', 'discovery')['attributes'], 'attribute_id'), true), 'discovery stays authenticated-only even for actual friends');
echo json_encode(['status' => 'passed', 'checks' => count($checks), 'checks_passed' => $checks, 'database_calls' => 0, 'network_calls' => 0, 'model_calls' => 0], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
