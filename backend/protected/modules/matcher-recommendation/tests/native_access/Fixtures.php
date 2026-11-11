<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\tests\native_access;
use humhub\modules\matcherRecommendation\adapters\native\{NativeCurrentEventAccess, ServerSelectionSource};
use yii\db\Connection;

/** Test-only sources/DDL. None is registered with the module or an application. */
final class MutableSelection implements ServerSelectionSource
{
    public array $value = ['actor_id' => 1, 'space_id' => 7, 'selection_revision' => 'synthetic-selection-1'];
    public int $reads = 0;
    public ?\Closure $onRead = null;
    public function read(): array
    {
        $this->reads++;
        if ($this->onRead !== null) { ($this->onRead)($this); }
        return $this->value;
    }
}

final class CountingConnection extends Connection
{
    public array $selects = [];
    public ?\Closure $onSelect = null;
    public function createCommand($sql = null, $params = [])
    {
        if (is_string($sql) && preg_match('/^\s*SELECT\b/i', $sql)) {
            $this->selects[] = ['sql' => $sql, 'master' => !$this->enableSlaves, 'cache_disabled' => $this->getQueryCacheInfo(null, null) === null, 'logging' => $this->enableLogging, 'profiling' => $this->enableProfiling];
            if ($this->onSelect !== null) { ($this->onSelect)($this, count($this->selects)); }
        }
        return parent::createCommand($sql, $params);
    }
}

final class SyntheticWebUser extends \yii\web\User
{
    public mixed $syntheticId = 1;
    public bool $syntheticGuest = false;
    public function init() {}
    public function getIsGuest() { return $this->syntheticGuest; }
    public function getId() { return $this->syntheticId; }
}

final class SyntheticSession extends \yii\web\Session
{
    public array $values = [];
    public int $writes = 0;
    public function init() {}
    public function get($key, $defaultValue = null) { return $this->values[$key] ?? $defaultValue; }
    public function set($key, $value) { $this->writes++; throw new \RuntimeException('The source must be read-only.'); }
}

final class Fixtures
{
    public static function database(int $candidates = 4): CountingConnection
    {
        $db = new CountingConnection(['dsn' => 'sqlite::memory:', 'enableLogging' => false, 'enableProfiling' => false, 'enableSchemaCache' => false, 'queryCache' => new \yii\caching\ArrayCache()]);
        $db->open();
        foreach ([
            'CREATE TABLE user (id INTEGER PRIMARY KEY, contentcontainer_id INTEGER, status INTEGER NOT NULL, visibility INTEGER NOT NULL, updated_at TEXT)',
            'CREATE TABLE space (id INTEGER PRIMARY KEY, contentcontainer_id INTEGER, status INTEGER NOT NULL, visibility INTEGER, join_policy INTEGER, updated_at TEXT)',
            'CREATE TABLE space_membership (id INTEGER PRIMARY KEY AUTOINCREMENT, space_id INTEGER NOT NULL, user_id INTEGER NOT NULL, status INTEGER NOT NULL, group_id TEXT, created_at TEXT, updated_at TEXT)',
            'CREATE TABLE contentcontainer_blocked_users (contentcontainer_id INTEGER NOT NULL, user_id INTEGER NOT NULL, PRIMARY KEY(contentcontainer_id,user_id))',
            'CREATE TABLE user_friendship (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, friend_user_id INTEGER NOT NULL, created_at TEXT NOT NULL, UNIQUE(user_id,friend_user_id))',
        ] as $sql) { $db->createCommand($sql)->execute(); }
        foreach ([7, 8] as $space) {
            $db->createCommand()->insert('space', ['id' => $space, 'contentcontainer_id' => 1000 + $space, 'status' => 1, 'visibility' => 0, 'join_policy' => 1, 'updated_at' => '2026-11-11 00:00:00'])->execute();
        }
        for ($id = 1; $id <= $candidates + 1; $id++) { self::user($db, $id); self::member($db, $id); }
        self::member($db, 1, 8);
        $db->selects = [];
        return $db;
    }
    public static function user(Connection $db, int $id, int $status = 1, int $visibility = 1): void
    {
        $db->createCommand()->insert('user', ['id' => $id, 'contentcontainer_id' => 10000 + $id, 'status' => $status, 'visibility' => $visibility, 'updated_at' => '2026-11-11 00:00:00'])->execute();
    }
    public static function member(Connection $db, int $id, int $space = 7, int $status = 3): void
    {
        $db->createCommand()->insert('space_membership', ['user_id' => $id, 'space_id' => $space, 'status' => $status, 'group_id' => 'member', 'created_at' => '2026-11-11 00:00:00', 'updated_at' => '2026-11-11 00:00:00'])->execute();
    }
    public static function friend(Connection $db, int $from, int $to): void
    {
        $db->createCommand()->insert('user_friendship', ['user_id' => $from, 'friend_user_id' => $to, 'created_at' => '2026-11-11 00:00:00'])->execute();
    }
    public static function block(Connection $db, int $container, int $user): void
    {
        $db->createCommand()->insert('contentcontainer_blocked_users', ['contentcontainer_id' => $container, 'user_id' => $user])->execute();
    }
    public static function events(Connection $db, ?MutableSelection $source = null): NativeCurrentEventAccess
    {
        return new NativeCurrentEventAccess($db, $source ?? new MutableSelection(), 'synthetic-activity-policy-1');
    }
}
