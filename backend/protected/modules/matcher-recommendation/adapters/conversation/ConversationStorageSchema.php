<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\conversation;
use PDO;

/** Explicit installer for one recommendation-owned table; never runs at construction. */
final class ConversationStorageSchema
{
    public const TABLE = 'matcher_recommendation_conversation';

    public static function sql(string $driver, string $prefix = ''): string
    {
        $table = ConversationRuntimeSchema::table($prefix, self::TABLE);
        return match ($driver) {
            'sqlite' => 'CREATE TABLE ' . $table . ' (id TEXT NOT NULL PRIMARY KEY, owner_id INTEGER NOT NULL CHECK(owner_id > 0), event_id INTEGER NOT NULL CHECK(event_id > 0), version INTEGER NOT NULL CHECK(version > 0), snapshot_json TEXT NOT NULL)',
            'mysql' => 'CREATE TABLE ' . $table . ' (id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY, owner_id BIGINT NOT NULL, event_id BIGINT NOT NULL, version BIGINT NOT NULL, snapshot_json MEDIUMTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL) ENGINE=InnoDB',
            default => throw new ConversationStorageException('driver_unsupported'),
        };
    }

    public static function install(PDO $db): void
    {
        try {
            if ($db->inTransaction()) { throw new ConversationStorageException('transaction_unsupported'); }
            if ($db->getAttribute(PDO::ATTR_ERRMODE) !== PDO::ERRMODE_EXCEPTION) { throw new ConversationStorageException('invalid_data'); }
            if ($db->exec(self::sql((string)$db->getAttribute(PDO::ATTR_DRIVER_NAME))) === false) {
                throw new ConversationStorageException('dependency_unavailable');
            }
        } catch (ConversationStorageException $error) { throw new ConversationStorageException($error->reason); }
        catch (\Throwable) { throw new ConversationStorageException('dependency_unavailable'); }
    }
}
