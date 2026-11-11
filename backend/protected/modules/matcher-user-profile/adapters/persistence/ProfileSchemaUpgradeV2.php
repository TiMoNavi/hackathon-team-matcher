<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\persistence;

use RuntimeException;
use yii\db\Connection;

/** Additive S2 migration: existing values and visibility decisions are retained. */
final class ProfileSchemaUpgradeV2
{
    public function __construct(private Connection $db) {}
    public function install(): array
    {
        if ($this->db->driverName !== 'mysql' || $this->db->getTransaction()?->isActive) {
            throw new RuntimeException('S2 upgrade requires MySQL outside an application transaction.');
        }
        $lock = 'matcher-profile-' . substr(hash('sha256', $this->db->dsn . $this->db->tablePrefix), 0, 32);
        if ((int)$this->db->createCommand('SELECT GET_LOCK(:lock,0)', [':lock' => $lock])->queryScalar() !== 1) {
            throw new RuntimeException('Profile schema migration is already running.');
        }
        try {
            foreach (['state', 'attribute', 'revision', 'draft'] as $part) {
                if ($this->db->schema->getTableSchema($this->table($part), true) === null) {
                    throw new RuntimeException('S1 foundation must be installed first.');
                }
            }
            $this->column('draft', 'confirmation_hash', 'varchar(64) CHARACTER SET ascii COLLATE ascii_bin NULL', 'varchar(64)', true);
            $this->column('draft', 'confirmed_revision', 'bigint NULL', 'bigint', true);
            $this->column('state', 'projection_pending', 'tinyint NOT NULL DEFAULT 0', 'tinyint', false);
            $visibility = $this->db->schema->getTableSchema($this->table('attribute'), true)->getColumn('visibility');
            if (!in_array($visibility->defaultValue, ['private', 'authenticated'], true)) { throw new RuntimeException('Unexpected attribute visibility default.'); }
            $this->db->createCommand('ALTER TABLE ' . $this->quote('attribute') . " ALTER COLUMN visibility SET DEFAULT 'authenticated'")->execute();
            $oldBinding = "native_binding IS NULL OR (native_binding = field_key AND native_binding IN ('nickname','real_name','age_range','mbti','headline','bio','seeking','city','timezone')) OR (native_binding = 'primary_portfolio_link' AND field_key = 'portfolio_link')";
            $newBinding = str_replace("'city','timezone'", "'city','timezone','contact_phone'", $oldBinding);
            $this->replaceCheck('attribute', 'attribute_binding', $oldBinding, $newBinding);
            $oldOrigin = "origin IN ('manual','onboarding','import','ai','rules','admin_proposal','migration')";
            $newOrigin = "origin IN ('manual','onboarding','import','ai','rules','admin_proposal','migration','avatar_upload','contact_qr_upload','identity_change','http_request','native_edit')";
            $this->replaceCheck('draft', 'draft_origin', $oldOrigin, $newOrigin);
            $this->replaceCheck('draft', 'draft_confirm_result', null, '(confirmation_hash IS NULL AND confirmed_revision IS NULL) OR (confirmation_hash IS NOT NULL AND confirmed_revision > 0)');
            $this->replaceCheck('state', 'state_projection_pending', null, 'projection_pending IN (0,1)');
            $this->db->schema->refresh();
            return ['schema_version' => 2, 'core_tables' => 4, 'data_values_changed' => false];
        } finally { $this->db->createCommand('SELECT RELEASE_LOCK(:lock)', [':lock' => $lock])->queryScalar(); }
    }
    private function column(string $part, string $name, string $ddl, string $type, bool $nullable): void
    {
        $column = $this->db->schema->getTableSchema($this->table($part), true)->getColumn($name);
        if ($column === null) {
            $this->db->createCommand()->addColumn($this->table($part), $name, $ddl)->execute();
            $column = $this->db->schema->getTableSchema($this->table($part), true)->getColumn($name);
        }
        $actual = strtolower(preg_replace('/\b(tinyint|bigint)\(\d+\)/i', '$1', $column->dbType));
        if ($actual !== $type || $column->allowNull !== $nullable || ($name === 'projection_pending' && (string)$column->defaultValue !== '0')) { throw new RuntimeException('Existing S2 column conflicts: ' . $name); }
    }
    private function replaceCheck(string $part, string $key, ?string $old, string $new): void
    {
        $name = 'mp_' . ($this->db->tablePrefix === '' ? '' : substr(hash('sha256', $this->db->tablePrefix), 0, 8) . '_') . $key;
        $existing = $this->db->createCommand('SELECT cc.CHECK_CLAUSE,tc.ENFORCED FROM information_schema.CHECK_CONSTRAINTS cc JOIN information_schema.TABLE_CONSTRAINTS tc ON tc.CONSTRAINT_SCHEMA=cc.CONSTRAINT_SCHEMA AND tc.CONSTRAINT_NAME=cc.CONSTRAINT_NAME WHERE tc.TABLE_SCHEMA=DATABASE() AND tc.TABLE_NAME=:table AND tc.CONSTRAINT_NAME=:name', [':table' => $this->table($part), ':name' => $name])->queryOne();
        if ($existing !== false && $existing['ENFORCED'] === 'YES' && $this->normalize($existing['CHECK_CLAUSE']) === $this->normalize($new)) { return; }
        if ($existing !== false && ($existing['ENFORCED'] !== 'YES' || $old === null || $this->normalize($existing['CHECK_CLAUSE']) !== $this->normalize($old))) { throw new RuntimeException('Existing S2 CHECK conflicts: ' . $key); }
        $sql = 'ALTER TABLE ' . $this->quote($part) . ' ';
        if ($existing !== false) { $sql .= 'DROP CHECK ' . $this->db->quoteColumnName($name) . ', '; }
        $sql .= 'ADD CONSTRAINT ' . $this->db->quoteColumnName($name) . ' CHECK (' . $new . ')';
        $this->db->createCommand($sql)->execute();
    }
    private function table(string $part): string { return $this->db->tablePrefix . 'matcher_profile_' . $part; }
    private function quote(string $part): string { return $this->db->quoteTableName($this->table($part)); }
    private function normalize(string $expression): string
    {
        $expression = str_replace([chr(92) . chr(39), chr(92) . chr(34)], [chr(39), chr(34)], $expression);
        $expression = preg_replace('/_(?:utf8mb4|utf8mb3|ascii|latin1)(?=\s*[\x27\x22])/i', '', $expression);
        $expression = preg_replace('/\bcharset\s+\w+/i', '', $expression);
        return strtolower(preg_replace('/[\s\x60()]+/', '', $expression));
    }
}
