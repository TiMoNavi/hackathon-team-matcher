<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\memory;
use humhub\modules\matcherProfile\domain\ports\QuestionRepository;
final class InMemoryQuestionRepository implements QuestionRepository
{
    public array $batches = []; public array $answerRows = []; public ?string $failOn = null;
    public function transaction(callable $callback): mixed
    { $before = [$this->batches, $this->answerRows]; try { return $callback(); } catch (\Throwable $e) { [$this->batches, $this->answerRows] = $before; throw $e; } }
    public function findBatch(string $id, bool $forUpdate = false): ?array { return $this->batches[$id] ?? null; }
    public function saveBatch(array $batch): void { $this->fail('saveBatch'); $this->batches[$batch['id']] = $batch; }
    public function findAnswer(string $batchId, string $questionId, bool $forUpdate = false): ?array { return $this->answerRows[$batchId][$questionId] ?? null; }
    public function answers(string $batchId): array { return array_values($this->answerRows[$batchId] ?? []); }
    public function saveAnswer(array $answer): void { $this->fail('saveAnswer'); $this->answerRows[$answer['batch_id']][$answer['question_id']] = $answer; }
    private function fail(string $op): void { if ($this->failOn === $op) { throw new \RuntimeException('Synthetic question failure.'); } }
}
