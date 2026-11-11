<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\persistence;

use RuntimeException;
use yii\db\Connection;

/** Widen the original S5-A CHECK in one atomic MySQL ALTER, without touching rows. */
final class SourceKindSchemaUpgrade
{
    private const LEGACY = "kind IN ('github','resume')";
    private const CURRENT = "kind IN ('github','resume','web','text')";

    public function __construct(private Connection $db) {}

    public function install(): array
    {
        $ddl = new WorkflowSchemaSupport($this->db);
        return $ddl->install('sources', fn(): array => $this->ensureWhileLocked());
    }

    /** Caller must hold WorkflowSchemaSupport's sources installation lock. */
    public function ensureWhileLocked(): array
    {
        $table = $this->db->tablePrefix . 'matcher_profile_source';
        if ($this->db->schema->getTableSchema($table, true) === null) {
            throw new RuntimeException('Install the source tables before upgrading their kinds.');
        }
        $name = 'mw_' . substr(hash('sha256', $this->db->tablePrefix), 0, 8) . '_source_kind';
        $row = $this->db->createCommand('SELECT cc.CHECK_CLAUSE,tc.ENFORCED FROM information_schema.CHECK_CONSTRAINTS cc JOIN information_schema.TABLE_CONSTRAINTS tc ON tc.CONSTRAINT_SCHEMA=cc.CONSTRAINT_SCHEMA AND tc.CONSTRAINT_NAME=cc.CONSTRAINT_NAME WHERE tc.TABLE_SCHEMA=DATABASE() AND tc.TABLE_NAME=:table AND tc.CONSTRAINT_NAME=:name', [':table' => $table, ':name' => $name])->queryOne();
        $changed = false;
        if ($row) {
            if ($row['ENFORCED'] !== 'YES') { throw new RuntimeException('The source kind CHECK must remain enforced.'); }
            $expression = self::normalize($row['CHECK_CLAUSE']);
            if ($expression !== self::normalize(self::CURRENT)) {
                if ($expression !== self::normalize(self::LEGACY)) { throw new RuntimeException('The existing source kind CHECK conflicts with the supported upgrade.'); }
                $this->db->createCommand('ALTER TABLE ' . $this->db->quoteTableName($table) . ' DROP CHECK ' . $this->db->quoteColumnName($name) . ', ADD CONSTRAINT ' . $this->db->quoteColumnName($name) . ' CHECK (' . self::CURRENT . ')')->execute();
                $changed = true;
            }
        } else {
            (new WorkflowSchemaSupport($this->db))->check('matcher_profile_source', 'source_kind', self::CURRENT);
            $changed = true;
        }
        return ['source_kinds' => ['github', 'resume', 'web', 'text'], 'constraint_changed' => $changed, 'native_data_changed' => false];
    }

    private static function normalize(string $expression): string
    {
        $expression = str_replace([chr(92) . chr(39), chr(92) . chr(34)], [chr(39), chr(34)], $expression);
        $expression = preg_replace('/_(?:utf8mb4|utf8mb3|ascii|latin1)(?=\s*[\x27\x22])/i', '', $expression);
        return strtolower(preg_replace('/[\s\x60()]+/', '', $expression));
    }
}
