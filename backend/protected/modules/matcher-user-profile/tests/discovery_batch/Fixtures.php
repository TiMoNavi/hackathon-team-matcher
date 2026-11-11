<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\tests\discovery_batch;

use yii\db\Connection;

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

/** Only synthetic rows in a new SQLite memory database. Never opens application config. */
final class Fixtures
{
    public static function database(int $owners = 2): CountingConnection
    {
        $db = new CountingConnection(['dsn' => 'sqlite::memory:', 'enableLogging' => false, 'enableProfiling' => false, 'enableSchemaCache' => false, 'queryCache' => new \yii\caching\ArrayCache()]);
        $db->open();
        foreach ([
            'CREATE TABLE user (id INTEGER PRIMARY KEY, time_zone TEXT)',
            'CREATE TABLE profile (user_id INTEGER PRIMARY KEY, title TEXT, about TEXT, matcher_mbti TEXT, matcher_seeking TEXT, firstname TEXT, lastname TEXT, city TEXT, url TEXT, mobile TEXT, matcher_nickname TEXT, matcher_age_range TEXT)',
            'CREATE TABLE matcher_profile_state (id TEXT PRIMARY KEY, user_id INTEGER, scope_key TEXT, space_id INTEGER, revision INTEGER, permission_version INTEGER, identity_version INTEGER, current_revision_id TEXT, UNIQUE(user_id,scope_key))',
            'CREATE TABLE matcher_profile_attribute (attribute_id TEXT PRIMARY KEY, state_id TEXT, scope_key TEXT, field_key TEXT, storage_kind TEXT, native_binding TEXT, value_json TEXT, visibility TEXT, confirmation TEXT, last_confirmed_at TEXT, display_label TEXT, sort_order INTEGER, schema_version INTEGER)',
        ] as $sql) { $db->createCommand($sql)->execute(); }
        for ($id = 1; $id <= $owners; $id++) {
            $db->createCommand()->insert('user', ['id' => $id, 'time_zone' => 'Asia/Shanghai'])->execute();
            $db->createCommand()->insert('profile', ['user_id' => $id, 'title' => 'Synthetic headline ' . $id, 'about' => 'Synthetic bio', 'matcher_mbti' => 'INTJ', 'matcher_seeking' => 'Build a project', 'firstname' => 'Synthetic', 'lastname' => 'Person', 'city' => 'Example', 'url' => 'https://example.org/demo', 'mobile' => 'SYNTHETIC_PRIVATE_PHONE', 'matcher_nickname' => 'SYNTHETIC_IDENTITY', 'matcher_age_range' => '25_34'])->execute();
            self::state($db, $id, 'global');
            self::state($db, $id, 'space:7');
            self::attribute($db, $id, 'global', 'skill', ['code' => 'php', 'label' => 'PHP']);
            self::attribute($db, $id, 'global', 'headline', null, ['storage_kind' => 'native', 'native_binding' => 'headline']);
            self::attribute($db, $id, 'space:7', 'event_role', ['code' => 'developer', 'label' => 'Developer']);
        }
        $db->selects = [];
        return $db;
    }
    public static function state(Connection $db, int $owner, string $scope, array $changes = []): void
    {
        $db->createCommand()->insert('matcher_profile_state', array_replace([
            'id' => $owner . '-' . $scope, 'user_id' => $owner, 'scope_key' => $scope, 'space_id' => $scope === 'global' ? null : (int)substr($scope, 6),
            'revision' => $scope === 'global' ? 3 : 5, 'permission_version' => $scope === 'global' ? 2 : 4,
            'identity_version' => $scope === 'global' ? 7 : 0, 'current_revision_id' => $owner . '-' . $scope . '-revision',
        ], $changes))->execute();
    }
    public static function attribute(Connection $db, int $owner, string $scope, string $key, mixed $value, array $changes = []): void
    {
        $db->createCommand()->insert('matcher_profile_attribute', array_replace([
            'attribute_id' => $owner . '-' . $scope . '-' . $key, 'state_id' => $owner . '-' . $scope, 'scope_key' => $scope, 'field_key' => $key,
            'storage_kind' => 'inline', 'native_binding' => null, 'value_json' => $value === null ? null : json_encode($value, JSON_THROW_ON_ERROR),
            'visibility' => 'authenticated', 'confirmation' => 'confirmed', 'last_confirmed_at' => '2026-11-11 00:00:00',
            'display_label' => null, 'sort_order' => 0, 'schema_version' => 2,
        ], $changes))->execute();
    }
}
