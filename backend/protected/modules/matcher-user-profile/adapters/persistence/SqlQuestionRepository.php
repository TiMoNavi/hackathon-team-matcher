<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\persistence;

use humhub\modules\matcherProfile\domain\ports\QuestionRepository;
use yii\db\Connection;
use yii\db\JsonExpression;
use yii\db\Query;
use yii\db\Transaction;

final class SqlQuestionRepository implements QuestionRepository
{
    public function __construct(private Connection $db) {}
    public function transaction(callable $callback): mixed
    {
        $tx = $this->db->beginTransaction($this->db->getTransaction()?->isActive ? null : Transaction::READ_COMMITTED);
        try { $result = $callback(); $tx->commit(); return $result; }
        catch (\Throwable $error) { if ($tx->isActive) { $tx->rollBack(); } throw $error; }
    }
    public function findBatch(string $id, bool $forUpdate = false): ?array
    {
        $row = $this->one('batch', ['id' => $id], $forUpdate);
        if ($row === null) { return null; }
        foreach (['owner_id', 'version', 'schema_version'] as $key) { $row[$key] = (int)$row[$key]; }
        $row['space_id'] = $row['space_id'] === null ? null : (int)$row['space_id'];
        foreach (['profile_versions', 'questions'] as $key) { $row[$key] = $this->decode($row[$key . '_json']); unset($row[$key . '_json']); }
        if(array_key_exists('ai_metadata_json',$row)){$row['ai_metadata']=$row['ai_metadata_json']===null?[]:$this->decode($row['ai_metadata_json']);unset($row['ai_metadata_json']);}
        return $row;
    }
    public function saveBatch(array $batch): void
    {
        $this->requireTransaction();
        $row = array_intersect_key($batch, array_flip(['id','owner_id','space_id','version','generation_mode','schema_version','policy_version','created_at','updated_at']));
        foreach (['profile_versions','questions'] as $key) { $row[$key . '_json'] = new JsonExpression($batch[$key]); }
        if(isset($batch['ai_metadata']))$row['ai_metadata_json']=new JsonExpression($batch['ai_metadata']);
        $updates = $row; foreach (['id','owner_id','space_id','created_at'] as $key) { unset($updates[$key]); }
        $this->db->createCommand()->upsert($this->table('batch'), $row, $updates)->execute();
    }
    public function findAnswer(string $batchId, string $questionId, bool $forUpdate = false): ?array { return $this->answer($this->one('answer', ['batch_id' => $batchId, 'question_id' => $questionId], $forUpdate)); }
    public function answers(string $batchId): array
    {
        $command = (new Query())->from($this->table('answer'))->where(['batch_id' => $batchId])->orderBy(['question_id' => SORT_ASC])->createCommand($this->db);
        if ($this->db->getTransaction()?->isActive) { $params = $command->params; $command->setSql($command->getSql() . ' FOR SHARE')->bindValues($params); }
        return array_map(fn(array $row): array => $this->answer($row), $command->queryAll());
    }
    public function saveAnswer(array $answer): void
    {
        $this->requireTransaction();
        $row = array_intersect_key($answer, array_flip(['id','batch_id','question_id','version','answer_type','free_text','created_at','updated_at']));
        $row['selected_options_json'] = new JsonExpression($answer['selected_options']);
        $updates = $row; foreach (['id','batch_id','question_id','created_at'] as $key) { unset($updates[$key]); }
        $this->db->createCommand()->upsert($this->table('answer'), $row, $updates)->execute();
    }
    private function one(string $part, array $condition, bool $lock): ?array
    {
        if ($lock) { $this->requireTransaction(); }
        $command = (new Query())->from($this->table($part))->where($condition)->createCommand($this->db);
        if ($lock) { $params = $command->params; $command->setSql($command->getSql() . ' FOR UPDATE')->bindValues($params); }
        return $command->queryOne() ?: null;
    }
    private function answer(?array $row): ?array
    {
        if ($row === null) { return null; }
        $row['version'] = (int)$row['version']; $row['selected_options'] = $this->decode($row['selected_options_json']); unset($row['selected_options_json']);
        return $row;
    }
    private function decode(mixed $json): array { return is_string($json) ? json_decode($json, true, 64, JSON_THROW_ON_ERROR) : $json; }
    private function table(string $part): string { return $this->db->tablePrefix . 'matcher_profile_question_' . $part; }
    private function requireTransaction(): void { if (!$this->db->getTransaction()?->isActive) { throw new \LogicException('Question writes and locks require a transaction.'); } }
}
