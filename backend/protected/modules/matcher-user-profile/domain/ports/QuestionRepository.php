<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\domain\ports;
interface QuestionRepository
{
    public function transaction(callable $callback): mixed;
    public function findBatch(string $id, bool $forUpdate = false): ?array;
    public function saveBatch(array $batch): void;
    public function findAnswer(string $batchId, string $questionId, bool $forUpdate = false): ?array;
    public function answers(string $batchId): array;
    public function saveAnswer(array $answer): void;
}
