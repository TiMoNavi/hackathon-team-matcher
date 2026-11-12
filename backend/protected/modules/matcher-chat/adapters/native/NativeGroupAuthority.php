<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\adapters\native;

use humhub\modules\matcherChat\adapters\persistence\SqlState;
use humhub\modules\matcherChat\domain\SafeInteger;

/** Current native facts; this adapter never creates friendships or searches people. */
final class NativeGroupAuthority
{
    private ?bool $ready = null;
    public function __construct(private readonly SqlState $sql, private readonly bool $configured) {}
    public function ready(): bool
    {
        if ($this->ready !== null) { return $this->ready; }
        foreach (['user_friendship', 'contentcontainer_blocked_users', 'setting'] as $table) {
            $schema = $this->sql->db->schema->getTableSchema('{{%' . $table . '}}');
            if ($schema === null) { return $this->ready = false; }
            $engine = $this->sql->one('SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:table', [':table' => $this->sql->db->tablePrefix . $table]);
            if ($engine === null || strtoupper((string)$engine['ENGINE']) !== 'INNODB') { return $this->ready = false; }
            if ($table === 'contentcontainer_blocked_users' && $schema->primaryKey !== ['contentcontainer_id', 'user_id']) { return $this->ready = false; }
        }
        return $this->ready = true;
    }
    public function enabled(): bool
    {
        $this->guard();
        if (!$this->configured || !$this->ready()) { return false; }
        $rows = $this->sql->all('SELECT value FROM {{%setting}} WHERE module_id=:module AND name=:name FOR UPDATE', [':module' => 'matcher-chat', ':name' => 'groupsEnabled']);
        return count($rows) === 1 && in_array($rows[0]['value'], ['1', 'true'], true);
    }
    public function account(int $id): ?array
    {
        $this->guard(); SafeInteger::positive($id, 'user_id');
        return $this->sql->one('SELECT id,status,contentcontainer_id FROM {{%user}} WHERE id=:id FOR UPDATE', [':id' => $id]);
    }
    public function friendsUnblocked(int $first, int $second): bool
    {
        $this->guard();
        if ($first === $second || !$this->enabled()) { return false; }
        $pair = [$first, $second]; sort($pair, SORT_NUMERIC);
        $settings = $this->sql->all('SELECT value FROM {{%setting}} WHERE module_id=:module AND name=:name FOR UPDATE', [':module' => 'friendship', ':name' => 'enable']);
        $users = $this->sql->all('SELECT id,status,contentcontainer_id FROM {{%user}} WHERE id IN (:low,:high) ORDER BY id FOR UPDATE', [':low' => $pair[0], ':high' => $pair[1]]);
        if (count($users) !== 2 || array_map(static fn ($row): int => SafeInteger::native($row['id'], 'user_id'), $users) !== $pair) { return false; }
        $containers = array_map(static fn ($row): int => SafeInteger::native($row['contentcontainer_id'], 'contentcontainer_id'), $users);
        $keys = [[$containers[0], $pair[1]], [$containers[1], $pair[0]]]; sort($keys);
        $blocks = [];
        // Match native block-before-cancel order and lock absent primary keys too.
        foreach ($keys as [$container, $other]) {
            $blocks[] = $this->sql->all('SELECT contentcontainer_id,user_id FROM {{%contentcontainer_blocked_users}} FORCE INDEX (PRIMARY) WHERE contentcontainer_id=:container AND user_id=:other FOR UPDATE', [':container' => $container, ':other' => $other]);
        }
        $friends = [];
        foreach ([[$pair[0], $pair[1]], [$pair[1], $pair[0]]] as [$owner, $other]) {
            $friends[] = $this->sql->all('SELECT id,user_id,friend_user_id,created_at FROM {{%user_friendship}} WHERE user_id=:owner AND friend_user_id=:other ORDER BY id LIMIT 2 FOR UPDATE', [':owner' => $owner, ':other' => $other]);
        }
        return count($settings) === 1 && in_array($settings[0]['value'], ['1', 'true'], true)
            && (int)$users[0]['status'] === 1 && (int)$users[1]['status'] === 1 && $containers[0] !== $containers[1]
            && $blocks === [[], []] && count($friends[0]) === 1 && count($friends[1]) === 1;
    }
    private function guard(): void { if (!$this->sql->db->getTransaction()?->getIsActive()) { throw new \LogicException('Group native facts require current transaction locks.'); } }
}
