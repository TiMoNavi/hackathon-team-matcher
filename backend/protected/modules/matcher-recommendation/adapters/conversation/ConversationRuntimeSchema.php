<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\conversation;
use PDO;

/** Recommendation-owned lifecycle and quota only. No platform balance or relationship facts. */
final class ConversationRuntimeSchema
{
    public const RUNTIME = 'matcher_recommendation_runtime';
    public const QUOTA = 'matcher_recommendation_quota';
    public const ATTEMPT = 'matcher_recommendation_attempt';
    public static function table(string $prefix, string $base): string
    {
        $name = $prefix . $base;
        if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]{0,63}$/D', $name)) { throw new ConversationReadinessException('storage_unavailable'); }
        return $name;
    }
    public static function statements(string $driver, string $prefix = ''): array
    {
        if (!in_array($driver, ['sqlite', 'mysql'], true)) { throw new ConversationReadinessException('storage_unavailable'); }
        $runtime = self::table($prefix, self::RUNTIME); $quota = self::table($prefix, self::QUOTA); $attempt = self::table($prefix, self::ATTEMPT);
        $token = $driver === 'mysql' ? 'VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin' : 'TEXT';
        $suffix = $driver === 'mysql' ? ' ENGINE=InnoDB' : '';
        return [
            "CREATE TABLE $runtime (slot INTEGER NOT NULL PRIMARY KEY, revision BIGINT NOT NULL, enabled INTEGER NOT NULL, provider_id $token NULL, provider_revision $token NULL)" . $suffix,
            "INSERT INTO $runtime (slot, revision, enabled, provider_id, provider_revision) VALUES (1, 1, 0, NULL, NULL)",
            "CREATE TABLE $quota (slot INTEGER NOT NULL PRIMARY KEY, revision BIGINT NOT NULL, allowance BIGINT NOT NULL, reserved BIGINT NOT NULL)" . $suffix,
            "INSERT INTO $quota (slot, revision, allowance, reserved) VALUES (1, 1, 0, 0)",
            "CREATE TABLE $attempt (permit_id $token NOT NULL PRIMARY KEY, run_id $token NOT NULL, stage $token NOT NULL, runtime_revision BIGINT NOT NULL, reserved_at BIGINT NOT NULL)" . $suffix,
        ];
    }
    public static function install(PDO $db, string $prefix = ''): void
    {
        if ($db->inTransaction() || $db->getAttribute(PDO::ATTR_ERRMODE) !== PDO::ERRMODE_EXCEPTION) { throw new ConversationReadinessException('storage_unavailable'); }
        foreach (self::statements((string)$db->getAttribute(PDO::ATTR_DRIVER_NAME), $prefix) as $sql) { $db->exec($sql); }
    }
}
