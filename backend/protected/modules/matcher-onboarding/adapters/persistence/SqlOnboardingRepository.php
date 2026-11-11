<?php
declare(strict_types=1);
namespace humhub\modules\matcherOnboarding\adapters\persistence;

use humhub\modules\matcherOnboarding\domain\ports\OnboardingRepository;
use yii\db\Connection;
use yii\db\JsonExpression;
use yii\db\Query;
use yii\db\Transaction;

final class SqlOnboardingRepository implements OnboardingRepository
{
    public function __construct(private Connection $db) {}
    public function transaction(callable $callback): mixed
    {
        $tx = $this->db->beginTransaction($this->db->getTransaction()?->isActive ? null : Transaction::READ_COMMITTED);
        try { $result = $callback(); $tx->commit(); return $result; }
        catch (\Throwable $error) { if ($tx->isActive) { $tx->rollBack(); } throw $error; }
    }
    public function findSession(string $id, bool $forUpdate = false): ?array { return $this->one(['id' => $id], $forUpdate); }
    public function findActive(int $ownerId, string $scopeKey, bool $forUpdate = false): ?array { return $this->one(['owner_id' => $ownerId, 'scope_key' => $scopeKey, 'status' => 'active'], $forUpdate); }
    public function saveSession(array $session): void
    {
        $this->requireTransaction();
        $row = array_intersect_key($session, array_flip(['id','owner_id','scope_key','space_id','version','stage','max_stage','status','created_at','updated_at','completed_at']));
        $row['resource_refs_json'] = new JsonExpression($session['resource_refs']);
        $updates = $row; foreach (['id','owner_id','scope_key','space_id','created_at'] as $key) { unset($updates[$key]); }
        $this->db->createCommand()->upsert('{{%matcher_onboarding_session}}', $row, $updates)->execute();
    }
    private function one(array $condition, bool $lock): ?array
    {
        if ($lock) { $this->requireTransaction(); }
        $command = (new Query())->from('{{%matcher_onboarding_session}}')->where($condition)->orderBy(['updated_at' => SORT_DESC, 'id' => SORT_DESC])->limit(1)->createCommand($this->db);
        if ($lock) { $params = $command->params; $command->setSql($command->getSql() . ' FOR UPDATE')->bindValues($params); }
        $row = $command->queryOne(); if (!$row) { return null; }
        foreach (['owner_id','version'] as $key) { $row[$key] = (int)$row[$key]; }
        $row['space_id'] = $row['space_id'] === null ? null : (int)$row['space_id'];
        $row['resource_refs'] = is_string($row['resource_refs_json']) ? json_decode($row['resource_refs_json'], true, 64, JSON_THROW_ON_ERROR) : $row['resource_refs_json'];
        unset($row['resource_refs_json']); return $row;
    }
    private function requireTransaction(): void { if (!$this->db->getTransaction()?->isActive) { throw new \LogicException('Onboarding writes and locks require a transaction.'); } }
}
