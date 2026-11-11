<?php
declare(strict_types=1);

// Independent S7 audit. No HumHub application, session, SQL, network or model is booted.
require __DIR__ . '/support/autoload.php';

use humhub\modules\matcherRecommendation\application\ManageDiscoverySettings;
use humhub\modules\matcherRecommendation\contracts\CurrentEventContext;
use humhub\modules\matcherRecommendation\contracts\ports\{CurrentEventAccess, DiscoverySettingsStore};
use humhub\modules\matcherRecommendation\domain\browse\DiscoveryException;

$checks = [];
function s7_audit_check(bool $condition, string $name): void
{
    global $checks;
    if (!$condition) { throw new RuntimeException('FAIL: ' . $name); }
    $checks[] = $name;
}
function s7_audit_reject(callable $action, string $reason, string $name): void
{
    try { $action(); } catch (Throwable $error) {
        s7_audit_check($error->getMessage() === $reason || ($error instanceof DiscoveryException && $error->errorCode === $reason), $name);
        return;
    }
    s7_audit_check(false, $name);
}

final class S7AuditEventAccess implements CurrentEventAccess
{
    public int $assertions = 0;
    public bool $allowed = true;
    public CurrentEventContext $context;
    public function __construct() { $this->context = new CurrentEventContext(41, 7, 'audit-access-v1', 'audit-policy-v1'); }
    public function resolve(int $viewerId, ?int $requestedSpaceId = null): CurrentEventContext
    {
        if (!$this->allowed || $viewerId !== $this->context->viewerId || ($requestedSpaceId !== null && $requestedSpaceId !== $this->context->spaceId)) {
            throw new RuntimeException('audit_access_denied');
        }
        return $this->context;
    }
    public function assertCurrent(CurrentEventContext $context): void
    {
        $this->assertions++;
        if (!$this->allowed || $context !== $this->context) { throw new RuntimeException('audit_context_changed'); }
    }
}
final class S7AuditSettingsStore implements DiscoverySettingsStore
{
    public array $calls = [];
    public ?Closure $afterRead = null;
    public ?Closure $afterChange = null;
    public function read(CurrentEventContext $context): array
    {
        $this->calls[] = ['read', $context];
        if ($this->afterRead) { ($this->afterRead)(); }
        return ['space_id' => $context->spaceId, 'version' => 4, 'discoverable' => false];
    }
    public function change(CurrentEventContext $context, int $expectedVersion, bool $discoverable): array
    {
        $this->calls[] = ['change', $context, $expectedVersion, $discoverable];
        if ($this->afterChange) { ($this->afterChange)(); }
        return ['space_id' => $context->spaceId, 'version' => $expectedVersion + 1, 'discoverable' => $discoverable];
    }
}

$access = new S7AuditEventAccess(); $store = new S7AuditSettingsStore();
$settings = new ManageDiscoverySettings($access, $store);
s7_audit_check($settings->read(41, 7) === ['space_id' => 7, 'version' => 4, 'discoverable' => false], 'settings returns the explicit port result');
s7_audit_check($store->calls[0][1] === $access->context && $access->assertions === 1, 'settings binds current context and checks it after read');
s7_audit_reject(fn() => $settings->read(41, 8), 'audit_access_denied', 'path Space mismatch fails before reading settings');
s7_audit_reject(fn() => $settings->read(42, 7), 'audit_access_denied', 'different actor cannot use viewer context');
s7_audit_check(count($store->calls) === 1, 'rejected actor and Space do not reach settings port');
s7_audit_reject(fn() => $settings->change(41, 7, -1, true), 'INVALID_VERSION', 'negative expected version is rejected');
s7_audit_check(count($store->calls) === 1, 'invalid expected version cannot mutate settings');
s7_audit_check($settings->change(41, 7, 4, true) === ['space_id' => 7, 'version' => 5, 'discoverable' => true], 'explicit opt-in forwards expected version and boolean');
s7_audit_check($store->calls[1] === ['change', $access->context, 4, true] && $access->assertions === 2, 'settings mutation carries server context and rechecks authorization');
$store->afterRead = static function () use ($access): void { $access->allowed = false; };
s7_audit_reject(fn() => $settings->read(41, 7), 'audit_context_changed', 'access revoked during read cannot return successful settings');
$access->allowed = true; $store->afterRead = null;
$store->afterChange = static function () use ($access): void { $access->allowed = false; };
s7_audit_reject(fn() => $settings->change(41, 7, 5, false), 'audit_context_changed', 'access revoked during write cannot return stale success');
$access->allowed = true;
$store->afterChange = static function (): void { throw new RuntimeException('audit_dependency_failed'); };
s7_audit_reject(fn() => $settings->change(41, 7, 6, false), 'audit_dependency_failed', 'dependency failure is never translated to empty success');

echo json_encode(['status' => 'passed', 'scope' => 'Independent memory-port application checks; no SQL/HTTP or seed validation claimed.', 'checks' => count($checks), 'checks_passed' => $checks, 'network_calls' => 0, 'model_calls' => 0], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
