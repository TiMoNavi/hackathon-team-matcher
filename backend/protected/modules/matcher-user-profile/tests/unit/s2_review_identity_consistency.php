<?php
declare(strict_types=1);

$moduleRoot = dirname(__DIR__, 2);
spl_autoload_register(static function (string $class) use ($moduleRoot): void {
    $prefix = implode(chr(92), ['humhub', 'modules', 'matcherProfile']) . chr(92);
    if (str_starts_with($class, $prefix)) {
        $path = $moduleRoot . '/' . str_replace(chr(92), '/', substr($class, strlen($prefix))) . '.php';
        if (is_file($path)) { require $path; }
    }
});

use humhub\modules\matcherProfile\application\IdentityService;
use humhub\modules\matcherProfile\application\interfaces\IdentityStore;
use humhub\modules\matcherProfile\application\interfaces\ProfileMediaStore;
use humhub\modules\matcherProfile\adapters\memory\InMemoryProfileAccessPolicy;

// Deterministic scheduler: a second writer commits between two unlocked queries.
$store = new class implements IdentityStore {
    public int $depth = 0;
    private array $current = ['identity_version' => 1, 'confirmed_avatar_ref' => null];
    private string $name = 'Synthetic version one';
    public function transaction(callable $callback): mixed { ++$this->depth; try { return $callback(); } finally { --$this->depth; } }
    public function state(int $ownerId, bool $lock = false): ?array {
        $copy = $this->current;
        if ($lock && $this->depth === 0) { throw new RuntimeException('Lock requested without transaction'); }
        if (!$lock) { $this->current['identity_version'] = 2; $this->name = 'Synthetic version two'; }
        return $copy;
    }
    public function nickname(int $ownerId): ?string { return $this->name; }
    public function ensureState(int $ownerId, string $now): array { throw new LogicException('Unused'); }
    public function saveState(array $state): void { throw new LogicException('Unused'); }
    public function saveNickname(array $state, string $nickname, string $now): void { throw new LogicException('Unused'); }
    public function media(string $ref): ?array { throw new LogicException('Unused'); }
    public function saveMedia(array $state, string $id, array $metadata, string $now): void { throw new LogicException('Unused'); }
    public function recordChange(array $state, array $change, int $baseVersion, string $now): void { throw new LogicException('Unused'); }
    public function isConfirmedQr(int $ownerId, string $ref): bool { throw new LogicException('Unused'); }
    public function refresh(int $ownerId): void {}
};
$files = new class implements ProfileMediaStore {
    public function stage(string $temporaryPath, string $kind, string $id): array { throw new LogicException('Unused'); }
    public function discard(string $id): void { throw new LogicException('Unused'); }
    public function assertReady(array $metadata): void { throw new LogicException('Unused'); }
    public function path(array $metadata, string $variant): string { throw new LogicException('Unused'); }
};
$access = new InMemoryProfileAccessPolicy();
$access->users = [1];
$result = (new IdentityService($store, $access, $files))->getIdentity(1);
$expected = [1 => 'Synthetic version one', 2 => 'Synthetic version two'][$result['identity_version']];
$passed = $expected === $result['nickname'];
echo json_encode(['status' => $passed ? 'passed' : 'failed', 'checks' => 1, 'consistent_identity_read' => $passed, 'returned_identity_version' => $result['identity_version'], 'returned_nickname' => $result['nickname'], 'database_calls' => 0], JSON_PRETTY_PRINT) . PHP_EOL;
exit($passed ? 0 : 1);
