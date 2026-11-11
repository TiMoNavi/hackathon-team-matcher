<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\conversation;
use humhub\modules\matcherRecommendation\contracts\ports\{AiPlatformBudget, Clock};
use humhub\modules\matcherRecommendation\domain\ai\AiRecommendationException;
use PDO;

/** Additional persistent recommendation quota. A real platform budget is mandatory, never replaced. */
final class PdoRecommendationBudget implements AiPlatformBudget
{
    private readonly string $quota; private readonly string $attempt;
    public function __construct(private readonly PDO $db, private readonly AiPlatformBudget $platform,
        private readonly PdoConversationRuntime $runtime, private readonly string $identity, private readonly Clock $clock, string $prefix = '')
    {
        $this->quota = ConversationRuntimeSchema::table($prefix, ConversationRuntimeSchema::QUOTA);
        $this->attempt = ConversationRuntimeSchema::table($prefix, ConversationRuntimeSchema::ATTEMPT);
    }
    /** Extend/reduce the cumulative allowance; usage never resets on restart, pause, or provider replacement. */
    public function configureAllowance(int $expectedRevision, int $allowance): array
    {
        if ($expectedRevision < 1 || $allowance < 0 || $allowance > 1000000000) { throw new AiRecommendationException('invalid_request'); }
        $this->connection();
        try {
            $stmt = $this->db->prepare('UPDATE ' . $this->quota . ' SET revision = revision + 1, allowance = ? WHERE slot = 1 AND revision = ? AND reserved <= ?');
            $stmt->execute([$allowance, $expectedRevision, $allowance]);
            if ($stmt->rowCount() !== 1) { throw new AiRecommendationException('run_conflict'); }
            return $this->read();
        } catch (AiRecommendationException $e) { throw $e; } catch (\Throwable) { throw new ConversationReadinessException('storage_unavailable'); }
    }
    public function read(): array
    {
        $this->connection();
        try {
            $row = $this->db->query('SELECT revision, allowance, reserved FROM ' . $this->quota . ' WHERE slot = 1')->fetch(PDO::FETCH_ASSOC);
            if (!$row) { throw new \RuntimeException(); }
            foreach ($row as $value) { if (!ctype_digit((string)$value)) { throw new \RuntimeException(); } }
            if ((int)$row['revision'] < 1 || (int)$row['reserved'] > (int)$row['allowance']) { throw new \RuntimeException(); }
            return array_map('intval', $row);
        } catch (\Throwable) { throw new ConversationReadinessException('storage_unavailable'); }
    }
    public function reserveAttempt(string $runId, string $stage, string $permitId): void
    {
        foreach ([$runId, $stage, $permitId] as $token) { if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/D', $token)) { throw new AiRecommendationException('invalid_request'); } }
        $this->connection(); $this->runtime->assertCurrent($this->identity); $revision = $this->runtime->read()['revision'];
        try {
            $this->db->beginTransaction();
            // Conditional UPDATE locks the singleton before INSERT, serializing quota reservations.
            $stmt = $this->db->prepare('UPDATE ' . $this->quota . ' SET reserved = reserved + 1 WHERE slot = 1 AND reserved < allowance');
            $stmt->execute(); if ($stmt->rowCount() !== 1) { throw new AiRecommendationException('budget_exhausted'); }
            $stmt = $this->db->prepare('INSERT INTO ' . $this->attempt . ' (permit_id, run_id, stage, runtime_revision, reserved_at) VALUES (?, ?, ?, ?, ?)');
            $stmt->execute([$permitId, $runId, $stage, $revision, $this->clock->now()->getTimestamp()]);
            $this->db->commit();
        } catch (\Throwable) {
            if ($this->db->inTransaction()) { $this->db->rollBack(); }
            throw new AiRecommendationException('budget_exhausted');
        }
        // Denial or crash burns this reservation conservatively; no call and no automatic refund/retry.
        $this->runtime->assertCurrent($this->identity);
        $this->platform->reserveAttempt($runId, $stage, $permitId);
        $this->runtime->assertCurrent($this->identity);
    }
    private function connection(): void
    {
        if ($this->db->inTransaction() || $this->db->getAttribute(PDO::ATTR_ERRMODE) !== PDO::ERRMODE_EXCEPTION) { throw new ConversationReadinessException('storage_unavailable'); }
    }
}
