<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\adapters\native;

use humhub\modules\matcherChat\adapters\persistence\SqlState;
use humhub\modules\matcherChat\domain\SafeInteger;

/** Current native facts only; no friendship writes, inferred N08 generation or cache. */
final class NativeSendEligibility
{
    private ?bool $ready = null;
    public function __construct(private readonly SqlState $sql, private readonly bool $configured) {}

    public function ready(): bool
    {
        if ($this->ready !== null) { return $this->ready; }
        foreach (['matcher_chat_send_receipt', 'user_friendship', 'contentcontainer_blocked_users', 'setting'] as $table) {
            if ($this->sql->db->schema->getTableSchema('{{%' . $table . '}}') === null) { return $this->ready = false; }
            $row = $this->sql->one('SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:table', [':table' => $this->sql->db->tablePrefix . $table]);
            if ($row === null || strtoupper((string)$row['ENGINE']) !== 'INNODB') { return $this->ready = false; }
        }
        if ($this->sql->db->schema->getTableSchema('{{%contentcontainer_blocked_users}}')->primaryKey !== ['contentcontainer_id', 'user_id']
            || $this->sql->db->schema->getTableSchema('{{%matcher_chat_send_receipt}}')->primaryKey !== ['message_id', 'user_id', 'client_message_id']) { return $this->ready = false; }
        return $this->ready = true;
    }

    /** Called only inside the chat's REPEATABLE READ/current-read boundary. */
    public function snapshot(array $state): array
    {
        if (!$this->configured || !$this->ready()) { return $this->result(false, ['disabled']); }
        if ($state['status'] !== 'active' || $state['type'] !== 'direct') { return $this->result(false, ['inactive']); }
        if (!$this->sql->db->getTransaction()?->getIsActive()) { throw new \LogicException('Send facts require transaction locks.'); }
        $settings = [];
        foreach ([['friendship', 'enable'], ['matcher-chat', 'sendEnabled']] as [$module, $name]) {
            $rows = $this->sql->all('SELECT value FROM {{%setting}} WHERE module_id=:module AND name=:name FOR UPDATE', [':module' => $module, ':name' => $name]);
            $settings[] = count($rows) === 1 ? $rows[0]['value'] : null;
        }
        $low = SafeInteger::native($state['pair_low'], 'pair_low');
        $high = SafeInteger::native($state['pair_high'], 'pair_high');
        $users = $this->sql->all('SELECT id,status,contentcontainer_id FROM {{%user}} WHERE id IN (:low,:high) ORDER BY id FOR UPDATE', [':low' => $low, ':high' => $high]);
        if (count($users) !== 2 || (int)$users[0]['id'] !== $low || (int)$users[1]['id'] !== $high) { return $this->result(false, [$settings, 'missing-users']); }
        $containers = [SafeInteger::native($users[0]['contentcontainer_id'], 'contentcontainer_id'), SafeInteger::native($users[1]['contentcontainer_id'], 'contentcontainer_id')];
        // Native block insertion precedes friendship cancellation. Match that order.
        $blocks = [];
        $blockKeys = [[$containers[0], $high], [$containers[1], $low]];
        usort($blockKeys, static fn(array $a, array $b): int => $a <=> $b);
        foreach ($blockKeys as [$container, $other]) {
            $blocks[] = $this->sql->all('SELECT contentcontainer_id,user_id FROM {{%contentcontainer_blocked_users}} FORCE INDEX (PRIMARY) WHERE contentcontainer_id=:container AND user_id=:other FOR UPDATE', [':container' => $container, ':other' => $other]);
        }
        $friends = [];
        foreach ([[$low, $high], [$high, $low]] as [$owner, $other]) {
            $friends[] = $this->sql->all('SELECT id,user_id,friend_user_id,created_at FROM {{%user_friendship}} WHERE user_id=:owner AND friend_user_id=:other ORDER BY id LIMIT 2 FOR UPDATE', [':owner' => $owner, ':other' => $other]);
        }
        $allowed = in_array($settings[0], [true, 1, '1', 'true'], true) && in_array($settings[1], [true, 1, '1', 'true'], true)
            && (int)$users[0]['status'] === 1 && (int)$users[1]['status'] === 1 && $containers[0] !== $containers[1]
            && $blocks === [[], []] && count($friends[0]) === 1 && count($friends[1]) === 1;
        return $this->result($allowed, [$settings, $users, $blocks, $friends]);
    }

    private function result(bool $allowed, array $facts): array
    {
        return ['allowed' => $allowed, 'fingerprint' => hash('sha256', json_encode($facts, JSON_THROW_ON_ERROR))];
    }
}
