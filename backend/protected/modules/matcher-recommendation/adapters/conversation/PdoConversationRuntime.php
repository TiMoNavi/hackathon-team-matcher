<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\conversation;
use humhub\modules\matcherRecommendation\contracts\ports\ConversationRuntimeGuard;
use humhub\modules\matcherRecommendation\domain\ai\AiRecommendationException;
use PDO;

/** A persistent revision, never AiProviderRegistry's process-local generation. */
final class PdoConversationRuntime implements ConversationRuntimeGuard
{
    private readonly string $table;
    private readonly ?\Closure $hostReady;
    public function __construct(private readonly PDO $db, string $prefix = '', ?callable $hostReady = null)
    {
        $this->table = ConversationRuntimeSchema::table($prefix, ConversationRuntimeSchema::RUNTIME);
        $this->hostReady = $hostReady === null ? null : \Closure::fromCallable($hostReady);
    }
    public function read(): array
    {
        return $this->safe(function (): array {
            $row = $this->db->query('SELECT revision, enabled, provider_id, provider_revision FROM ' . $this->table . ' WHERE slot = 1')->fetch(PDO::FETCH_ASSOC);
            if (!$row || !ctype_digit((string)$row['revision']) || (int)$row['revision'] < 1 || !in_array((string)$row['enabled'], ['0', '1'], true)) { throw new \RuntimeException(); }
            if ($row['provider_id'] !== null) { self::token($row['provider_id']); self::token($row['provider_revision']); }
            elseif ($row['provider_revision'] !== null || (int)$row['enabled'] !== 0) { throw new \RuntimeException(); }
            return ['revision' => (int)$row['revision'], 'enabled' => (bool)$row['enabled'], 'provider_id' => $row['provider_id'], 'provider_revision' => $row['provider_revision']];
        });
    }
    /** Trusted deployment operation. Every successful change rotates identity, including pause/resume. */
    public function configure(int $expectedRevision, bool $enabled, ?string $providerId, ?string $providerRevision): array
    {
        if ($expectedRevision < 1 || $expectedRevision >= PHP_INT_MAX || ($providerId === null) !== ($providerRevision === null) || ($enabled && $providerId === null)) { throw new AiRecommendationException('invalid_request'); }
        if ($providerId !== null) { self::token($providerId); self::token($providerRevision); }
        $this->safe(function () use ($expectedRevision, $enabled, $providerId, $providerRevision): void {
            $stmt = $this->db->prepare('UPDATE ' . $this->table . ' SET revision = revision + 1, enabled = ?, provider_id = ?, provider_revision = ? WHERE slot = 1 AND revision = ?');
            $stmt->execute([(int)$enabled, $providerId, $providerRevision, $expectedRevision]);
            if ($stmt->rowCount() !== 1) { throw new AiRecommendationException('run_conflict'); }
        });
        return $this->read();
    }
    public function identity(): string
    {
        $row = $this->read();
        if (!$row['enabled']) { throw new ConversationReadinessException('disabled'); }
        if ($this->hostReady !== null && !($this->hostReady)($row)) { throw new ConversationReadinessException('provider_unconfigured'); }
        return 'runtime-' . $row['revision'] . '-' . hash('sha256', $row['provider_id'] . ':' . $row['provider_revision']);
    }
    public function assertCurrent(string $identity): void
    {
        try { if (!hash_equals($identity, $this->identity())) { throw new \RuntimeException(); } }
        catch (\Throwable) { throw new AiRecommendationException('context_invalidated'); }
    }
    private function safe(callable $operation): mixed
    {
        try {
            if ($this->db->inTransaction() || $this->db->getAttribute(PDO::ATTR_ERRMODE) !== PDO::ERRMODE_EXCEPTION) { throw new \RuntimeException(); }
            return $operation();
        } catch (AiRecommendationException $error) { throw $error; }
        catch (\Throwable) { throw new ConversationReadinessException('storage_unavailable'); }
    }
    private static function token(mixed $value): void
    {
        if (!is_string($value) || !preg_match('/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/D', $value)) { throw new AiRecommendationException('invalid_request'); }
    }
}
