<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\persistence;

use RuntimeException;
use yii\db\Connection;

/** Additive S4 DDL helpers shared by the two owning module migrations. */
final class WorkflowSchemaSupport
{
    public function __construct(private Connection $db) {}
    public function install(string $component, callable $perform): array
    {
        if ($this->db->driverName !== 'mysql' || $this->db->getTransaction()?->isActive) { throw new RuntimeException('Workflow schema installation requires MySQL outside a transaction.'); }
        $lock = 'matcher-s4-' . substr(hash('sha256', $this->db->dsn . $this->db->tablePrefix . $component), 0, 32);
        if ((int)$this->db->createCommand('SELECT GET_LOCK(:name,0)', [':name' => $lock])->queryScalar() !== 1) { throw new RuntimeException('Workflow schema installation is already running.'); }
        try { $result = $perform(); $this->db->schema->refresh(); return $result; }
        finally { $this->db->createCommand('SELECT RELEASE_LOCK(:name)', [':name' => $lock])->queryScalar(); }
    }
    public function nativeKey(string $table): string
    {
        $type = $this->db->schema->getTableSchema('{{%' . $table . '}}', true)?->getColumn('id')?->dbType;
        if (!is_string($type) || !preg_match('/^(tinyint|smallint|mediumint|int|bigint)(\([0-9]+\))?( unsigned)?$/i', $type)) { throw new RuntimeException('Workflow migration requires a native integer key.'); }
        return $type;
    }
    public function table(string $name, array $columns): void
    {
        $table = $this->name($name);
        if ($this->db->schema->getTableSchema($table, true) === null) { $this->db->createCommand()->createTable($table, $columns, 'ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')->execute(); }
        $schema = $this->db->schema->getTableSchema($table, true);
        foreach ($columns as $key => $definition) {
            if (!is_string($key)) { continue; }
            $column = $schema->getColumn($key);
            preg_match('/^(char\(\d+\)|varchar\(\d+\)|datetime(?:\(\d+\))?|bigint(?:\(\d+\))?(?: unsigned)?|int(?:\(\d+\))?(?: unsigned)?|json|text)/i', $definition, $match);
            $normalize = static fn(string $value): string => strtolower(preg_replace('/\b(bigint|int)\(\d+\)/i', '$1', $value));
            if (!$column || !isset($match[1]) || $normalize($column->dbType) !== $normalize($match[1]) || $column->allowNull === str_contains($definition, 'NOT NULL')) { throw new RuntimeException('Existing workflow column conflicts: ' . $name . '.' . $key); }
        }
        if ($schema->primaryKey !== ['id']) { throw new RuntimeException('Existing workflow primary key conflicts.'); }
    }
    public function index(string $table, string $suffix, array $columns, bool $unique = false): void
    {
        $name = $this->constraint($suffix);
        $rows = $this->db->createCommand('SHOW INDEX FROM ' . $this->db->quoteTableName($this->name($table)) . ' WHERE Key_name=:name', [':name' => $name])->queryAll();
        if ($rows !== []) {
            usort($rows, static fn(array $a, array $b): int => $a['Seq_in_index'] <=> $b['Seq_in_index']);
            if (array_column($rows, 'Column_name') !== $columns || (int)$rows[0]['Non_unique'] !== (int)!$unique) { throw new RuntimeException('Existing workflow index conflicts.'); }
            return;
        }
        $this->db->createCommand()->createIndex($name, $this->name($table), $columns, $unique)->execute();
    }
    public function foreignKey(string $table, string $suffix, string $column, string $target): void
    {
        $name = $this->constraint($suffix); $physical = $this->name($table); $target = $this->name($target);
        $schema = $this->db->schema->getTableSchema($physical, true);
        if (isset($schema->foreignKeys[$name])) {
            $key = $schema->foreignKeys[$name];
            $rule = $this->db->createCommand('SELECT DELETE_RULE,UPDATE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=:table AND CONSTRAINT_NAME=:name', [':table' => $physical, ':name' => $name])->queryOne();
            if ($key !== [0 => $target, $column => 'id'] || !$rule || $rule['DELETE_RULE'] !== 'RESTRICT' || $rule['UPDATE_RULE'] !== 'RESTRICT') { throw new RuntimeException('Existing workflow relationship conflicts.'); }
            return;
        }
        $this->db->createCommand()->addForeignKey($name, $physical, [$column], $target, ['id'], 'RESTRICT', 'RESTRICT')->execute();
    }
    public function check(string $table, string $suffix, string $expression): void
    {
        $name = $this->constraint($suffix);
        $row = $this->db->createCommand('SELECT cc.CHECK_CLAUSE,tc.ENFORCED FROM information_schema.CHECK_CONSTRAINTS cc JOIN information_schema.TABLE_CONSTRAINTS tc ON tc.CONSTRAINT_SCHEMA=cc.CONSTRAINT_SCHEMA AND tc.CONSTRAINT_NAME=cc.CONSTRAINT_NAME WHERE tc.TABLE_SCHEMA=DATABASE() AND tc.TABLE_NAME=:table AND tc.CONSTRAINT_NAME=:name', [':table' => $this->name($table), ':name' => $name])->queryOne();
        if ($row) {
            $normalize = static function (string $value): string {
                $value = str_replace([chr(92) . chr(39), chr(92) . chr(34)], [chr(39), chr(34)], $value);
                $value = preg_replace('/_(?:utf8mb4|utf8mb3|ascii|latin1)(?=\s*[\x27\x22])/i', '', $value);
                return strtolower(preg_replace('/[\s\x60()]+/', '', $value));
            };
            if ($row['ENFORCED'] !== 'YES' || $normalize($row['CHECK_CLAUSE']) !== $normalize($expression)) { throw new RuntimeException('Existing workflow CHECK conflicts: ' . $suffix); }
            return;
        }
        $this->db->createCommand('ALTER TABLE ' . $this->db->quoteTableName($this->name($table)) . ' ADD CONSTRAINT ' . $this->db->quoteColumnName($name) . ' CHECK (' . $expression . ')')->execute();
    }
    private function name(string $name): string { return $this->db->tablePrefix . $name; }
    private function constraint(string $suffix): string { return 'mw_' . substr(hash('sha256', $this->db->tablePrefix), 0, 8) . '_' . $suffix; }
}
