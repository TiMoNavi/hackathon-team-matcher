<?php

declare(strict_types=1);

namespace humhub\modules\matcherProfile\adapters\persistence;

use humhub\modules\matcherProfile\domain\FieldCatalog;
use humhub\modules\space\models\Space;
use humhub\modules\user\models\Profile;
use humhub\modules\user\models\ProfileField;
use humhub\modules\user\models\ProfileFieldCategory;
use humhub\modules\user\models\User;
use humhub\modules\user\models\fieldtype\Text;
use RuntimeException;
use Yii;
use yii\db\Connection;

/** Version-one physical adapter. Never writes a user's profile values. */
final class ProfileSchemaInstaller
{
    private const MODULE = 'matcher-user-profile';
    private const CATEGORY_MARKER = 'matcher-user-profile:foundation-v1';
    private Connection $db;
    private array $report = [];

    public function __construct(Connection $db) { $this->db = $db; }

    public function install(): array
    {
        $this->report = [];
        if ($this->db !== Yii::$app->db || $this->db->driverName !== 'mysql') {
            throw new RuntimeException('Installer requires the active HumHub MySQL connection.');
        }
        $version = (string)$this->db->createCommand('SELECT VERSION()')->queryScalar();
        if (stripos($version, 'mariadb') !== false || version_compare($version, '8.0.16', '<')) {
            throw new RuntimeException('This migration requires MySQL 8.0.16+ with enforced CHECK constraints.');
        }
        if ($this->db->getTransaction()?->isActive) {
            throw new RuntimeException('Run schema installation outside an application transaction.');
        }
        $lock = 'matcher-profile-' . substr(hash('sha256', $this->db->dsn . $this->db->tablePrefix), 0, 32);
        if ((int)$this->db->createCommand('SELECT GET_LOCK(:lock, 0)', [':lock' => $lock])->queryScalar() !== 1) {
            throw new RuntimeException('Profile schema installation is already running.');
        }
        try {
            $this->preflight();
            $spec = $this->tables();
            foreach ($spec as $table => $columns) {
                if ($this->db->schema->getTableSchema($this->table($table), true) !== null) {
                    $this->verifyColumns($table, $columns);
                }
            }
            $this->installNativeFields();
            foreach ($spec as $table => $columns) {
                if ($this->db->schema->getTableSchema($this->table($table), true) === null) {
                    $this->db->createCommand()->createTable($this->table($table), $columns, 'ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')->execute();
                    $this->report[] = 'created:' . $table;
                }
                $this->verifyColumns($table, $columns);
            }
            $this->installIndexes();
            $this->installChecks();
            $this->installForeignKeys();
            $this->db->schema->refresh();
            return ['schema_version' => 1, 'native_fields' => 4, 'core_tables' => 4, 'operations' => $this->report];
        } finally {
            $this->db->createCommand('SELECT RELEASE_LOCK(:lock)', [':lock' => $lock])->queryScalar();
        }
    }

    private function preflight(): void
    {
        foreach ([User::tableName(), Space::tableName(), Profile::tableName(), ProfileField::tableName(), ProfileFieldCategory::tableName()] as $table) {
            if ($this->db->schema->getTableSchema($table, true) === null) {
                throw new RuntimeException('Required native table is unavailable: ' . $table);
            }
        }
        foreach (['firstname', 'lastname', 'title'] as $name) {
            if ((int)ProfileField::find()->where(['internal_name' => $name])->count() !== 1) {
                throw new RuntimeException('Native field definition must be unique: ' . $name);
            }
            $field = ProfileField::findOne(['internal_name' => $name]);
            if (!$field || $field->field_type_class !== Text::class) {
                throw new RuntimeException('Native field type conflicts with profile migration: ' . $name);
            }
            $this->assertNativeColumn($name, 'varchar(255)', true);
        }
        foreach (FieldCatalog::nativeFields() as $name => $definition) {
            if ((int)ProfileField::find()->where(['internal_name' => $name])->count() > 1) {
                throw new RuntimeException('Duplicate native field definition: ' . $name);
            }
            $field = ProfileField::findOne(['internal_name' => $name]);
            $class = 'humhub\\modules\\user\\models\\fieldtype\\' . $definition['field_type'];
            if ($field && ($field->module_id !== self::MODULE || $field->field_type_class !== $class)) {
                throw new RuntimeException('Native field is owned by another definition: ' . $name);
            }
            $column = $this->db->schema->getTableSchema(Profile::tableName(), true)->getColumn($name);
            if (!$field && $column !== null) {
                throw new RuntimeException('Unowned native column exists; review before adopting: ' . $name);
            }
            $this->assertNativeColumn($name, $definition['field_type'] === 'TextArea' ? 'text' : 'varchar(255)', false);
        }
    }

    private function installNativeFields(): void
    {
        $categories = ProfileFieldCategory::find()->where(['description' => self::CATEGORY_MARKER])->all();
        if (count($categories) > 1) { throw new RuntimeException('Duplicate profile foundation categories require review.'); }
        $category = $categories[0] ?? new ProfileFieldCategory();
        $category->title = '团队协作资料';
        $category->description = self::CATEGORY_MARKER;
        $category->sort_order = 400;
        $category->visibility = 0;
        $category->is_system = 1;
        $this->saveIfChanged($category, 'profile category');
        $order = 10;
        foreach (FieldCatalog::nativeFields() as $name => $definition) {
            $field = ProfileField::findOne(['internal_name' => $name]) ?? new ProfileField();
            $field->internal_name = $name;
            $field->module_id = self::MODULE;
            $field->field_type_class = 'humhub\\modules\\user\\models\\fieldtype\\' . $definition['field_type'];
            $field->profile_field_category_id = $category->id;
            $field->title = $definition['label'];
            $field->sort_order = $order;
            $field->is_system = 1;
            foreach (['required', 'visible', 'editable', 'searchable', 'directory_filter', 'show_at_registration'] as $flag) { $field->$flag = 0; }
            $this->saveIfChanged($field, $name);
            $type = $field->fieldType;
            if ($definition['field_type'] === 'Text') {
                $type->minLength = $definition['min_length'];
                $type->maxLength = $definition['max_length'];
            } elseif ($definition['field_type'] === 'Select') {
                $lines = [];
                foreach ($definition['options'] as $code => $label) { $lines[] = $code . '=>' . $label; }
                $type->options = implode("\n", $lines);
            }
            $this->saveTypeIfChanged($field);
            $this->assertNativeColumn($name, $definition['field_type'] === 'TextArea' ? 'text' : 'varchar(255)', true);
            $order += 10;
        }
        foreach (['firstname' => 120, 'lastname' => 120, 'title' => 160] as $name => $limit) {
            $field = ProfileField::findOne(['internal_name' => $name]);
            if ($name !== 'title') { $field->required = 0; } else { $field->title = '一句话自述'; }
            $this->saveIfChanged($field, $name);
            $field->fieldType->maxLength = $limit;
            $this->saveTypeIfChanged($field);
        }
    }

    private function saveIfChanged($model, string $label): void
    {
        if (($model->isNewRecord || $model->getDirtyAttributes() !== []) && !$model->save()) {
            throw new RuntimeException('Could not register ' . $label . '; invalid fields: ' . implode(',', array_keys($model->getErrors())));
        }
    }

    private function saveTypeIfChanged(ProfileField $field): void
    {
        $type = $field->fieldType;
        if (!$type->validate()) { throw new RuntimeException('Invalid native type configuration for ' . $field->internal_name); }
        $data = $type->attributes;
        unset($data['profileField']);
        $current = $field->field_type_config ? json_decode($field->field_type_config, true, 512, JSON_THROW_ON_ERROR) : null;
        $columnExists = $this->db->schema->getTableSchema(Profile::tableName(), true)->getColumn($field->internal_name) !== null;
        if (!$columnExists || $current != $data) {
            // Native save() creates the real column, persists config and refreshes Profile schema.
            if (!$type->save()) { throw new RuntimeException('Native field type save failed: ' . $field->internal_name); }
        }
        $this->db->schema->refreshTableSchema(Profile::tableName());
    }

    private function assertNativeColumn(string $name, string $type, bool $required): void
    {
        $column = $this->db->schema->getTableSchema(Profile::tableName(), true)->getColumn($name);
        if ($column === null && !$required) { return; }
        if ($column === null || $this->normalizeType($column->dbType) !== $type) { throw new RuntimeException('Incompatible native column: ' . $name); }
    }

    private function nativeKeyType(string $table, string $column): string
    {
        $type = $this->db->schema->getTableSchema($table, true)?->getColumn($column)?->dbType;
        if ($type === null || !preg_match('/^(tinyint|smallint|mediumint|int|bigint)(\([0-9]+\))?( unsigned)?$/i', $type)) {
            throw new RuntimeException('Native primary key must use a supported integer type.');
        }
        return $type;
    }

    private function tables(): array
    {
        $uuid = 'char(36) CHARACTER SET ascii COLLATE ascii_bin';
        $key = 'varchar(64) CHARACTER SET ascii COLLATE ascii_bin';
        $user = $this->nativeKeyType(User::tableName(), 'id');
        $space = $this->nativeKeyType(Space::tableName(), 'id');
        return [
            'matcher_profile_state' => [
                'id' => "$uuid NOT NULL", 'user_id' => "$user NOT NULL", 'scope_key' => "$key NOT NULL", 'space_id' => "$space NULL",
                'revision' => 'bigint NOT NULL DEFAULT 0', 'permission_version' => 'bigint NOT NULL DEFAULT 0',
                'current_revision_id' => "$uuid NULL", 'identity_version' => 'bigint NOT NULL DEFAULT 0', 'confirmed_avatar_ref' => 'varchar(255) NULL',
                'created_at' => 'datetime(6) NOT NULL', 'updated_at' => 'datetime(6) NOT NULL', 'PRIMARY KEY (id)',
            ],
            'matcher_profile_attribute' => [
                'attribute_id' => "$uuid NOT NULL", 'state_id' => "$uuid NOT NULL", 'scope_key' => "$key NOT NULL", 'field_key' => "$key NOT NULL",
                'storage_kind' => 'varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL', 'native_binding' => "$key NULL", 'value_json' => 'json NULL',
                'display_label' => 'varchar(255) NULL', 'record_group_id' => "$uuid NULL", 'sort_order' => 'int NOT NULL DEFAULT 0',
                'visibility' => "varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'private'", 'confirmation' => "varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'draft'",
                'last_confirmed_at' => 'datetime(6) NULL', 'schema_version' => 'bigint NOT NULL DEFAULT 1',
                'value_code' => "varchar(191) GENERATED ALWAYS AS (CASE WHEN JSON_TYPE(JSON_EXTRACT(value_json, '$.code')) = 'STRING' THEN JSON_UNQUOTE(JSON_EXTRACT(value_json, '$.code')) ELSE NULL END) STORED",
                'PRIMARY KEY (attribute_id)',
            ],
            'matcher_profile_revision' => [
                'id' => "$uuid NOT NULL", 'state_id' => "$uuid NOT NULL", 'revision' => 'bigint NOT NULL', 'snapshot_json' => 'json NOT NULL',
                'schema_version' => 'bigint NOT NULL DEFAULT 1', 'confirmed_at' => 'datetime(6) NOT NULL', 'created_at' => 'datetime(6) NOT NULL', 'PRIMARY KEY (id)',
            ],
            'matcher_profile_draft' => [
                'id' => "$uuid NOT NULL", 'state_id' => "$uuid NOT NULL", 'draft_kind' => "varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'profile'",
                'base_revision' => 'bigint NOT NULL', 'base_identity_version' => 'bigint NOT NULL', 'draft_version' => 'bigint NOT NULL DEFAULT 0',
                'fields_json' => 'json NOT NULL', 'origin' => 'varchar(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL', 'initiator_id' => "$user NOT NULL",
                'status' => "varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'editing'", 'created_at' => 'datetime(6) NOT NULL', 'updated_at' => 'datetime(6) NOT NULL', 'PRIMARY KEY (id)',
            ],
        ];
    }

    private function verifyColumns(string $table, array $columns): void
    {
        $schema = $this->db->schema->getTableSchema($this->table($table), true);
        foreach ($columns as $name => $definition) {
            if (is_int($name)) { continue; }
            $column = $schema->getColumn($name);
            preg_match('/^\w+(?:\(\d+\))?(?: unsigned)?/i', $definition, $match);
            $nullable = stripos($definition, 'NOT NULL') === false;
            if ($column === null || $this->normalizeType($column->dbType) !== $this->normalizeType($match[0]) || $column->allowNull !== $nullable) {
                throw new RuntimeException('Existing schema conflicts at ' . $table . '.' . $name);
            }
            preg_match('/ DEFAULT (\d+|\x27[^\x27]*\x27)/', $definition, $defaultMatch);
            $expectedDefault = isset($defaultMatch[1]) ? trim($defaultMatch[1], "'") : null;
            if (($expectedDefault === null) !== ($column->defaultValue === null) || ($expectedDefault !== null && (string)$column->defaultValue !== $expectedDefault)) {
                throw new RuntimeException('Existing column default conflicts at ' . $table . '.' . $name);
            }
            $meta = $this->db->createCommand('SELECT CHARACTER_SET_NAME, COLLATION_NAME, GENERATION_EXPRESSION, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:table AND COLUMN_NAME=:column', [':table' => $schema->name, ':column' => $name])->queryOne();
            if (str_contains($definition, 'CHARACTER SET ascii') && ($meta['CHARACTER_SET_NAME'] !== 'ascii' || $meta['COLLATION_NAME'] !== 'ascii_bin')) {
                throw new RuntimeException('Identifier collation conflicts at ' . $table . '.' . $name);
            }
            if ($name === 'value_code') {
                preg_match('/GENERATED ALWAYS AS \((.*)\) STORED$/', $definition, $expression);
                if (!str_contains($meta['EXTRA'], 'STORED GENERATED') || $this->normalizeExpression($meta['GENERATION_EXPRESSION']) !== $this->normalizeExpression($expression[1])) {
                    throw new RuntimeException('Generated value_code expression conflicts.');
                }
            }
        }
        $expectedPk = $table === 'matcher_profile_attribute' ? ['attribute_id'] : ['id'];
        if ($schema->primaryKey !== $expectedPk) { throw new RuntimeException('Existing primary key conflicts: ' . $table); }
    }

    private function installIndexes(): void
    {
        $indexes = [
            ['state_owner_scope', 'matcher_profile_state', ['user_id', 'scope_key'], true],
            ['state_id_scope', 'matcher_profile_state', ['id', 'scope_key'], true],
            ['state_space_owner', 'matcher_profile_state', ['space_id', 'user_id'], false],
            ['attribute_native', 'matcher_profile_attribute', ['state_id', 'native_binding'], true],
            ['attribute_field_sort', 'matcher_profile_attribute', ['state_id', 'field_key', 'sort_order'], false],
            ['attribute_match_code', 'matcher_profile_attribute', ['field_key', 'value_code', 'visibility', 'state_id'], false],
            ['revision_number', 'matcher_profile_revision', ['state_id', 'revision'], true],
            ['revision_state_id', 'matcher_profile_revision', ['state_id', 'id'], true],
            ['draft_state_status', 'matcher_profile_draft', ['state_id', 'status', 'updated_at'], false],
        ];
        foreach ($indexes as [$name, $table, $columns, $unique]) {
            $name = $this->constraint($name);
            $rows = $this->db->createCommand('SELECT COLUMN_NAME, NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=:table AND INDEX_NAME=:name ORDER BY SEQ_IN_INDEX', [':table' => $this->table($table), ':name' => $name])->queryAll();
            if ($rows === []) {
                $this->db->createCommand()->createIndex($name, $this->table($table), $columns, $unique)->execute();
            } elseif (array_column($rows, 'COLUMN_NAME') !== $columns || (int)$rows[0]['NON_UNIQUE'] !== (int)!$unique) {
                throw new RuntimeException('Existing index conflicts: ' . $name);
            }
        }
    }

    private function installChecks(): void
    {
        $checks = [
            'matcher_profile_state' => [
                'state_scope' => "(scope_key = 'global' AND space_id IS NULL) OR (space_id IS NOT NULL AND scope_key = CONCAT('space:', CAST(space_id AS CHAR)))",
                'state_versions' => 'revision >= 0 AND permission_version >= 0 AND identity_version >= 0',
                'state_identity' => "scope_key = 'global' OR (identity_version = 0 AND confirmed_avatar_ref IS NULL)",
                'state_revision_pointer' => '(revision = 0 AND current_revision_id IS NULL) OR (revision > 0 AND current_revision_id IS NOT NULL)',
            ],
            'matcher_profile_attribute' => [
                'attribute_storage' => "(storage_kind = 'native' AND scope_key = 'global' AND native_binding IS NOT NULL AND value_json IS NULL) OR (storage_kind = 'inline' AND native_binding IS NULL AND value_json IS NOT NULL AND JSON_TYPE(value_json) IN ('OBJECT','ARRAY','STRING','INTEGER','DOUBLE','BOOLEAN'))",
                'attribute_visibility' => "visibility IN ('authenticated','friends','private')",
                'attribute_confirmation' => "confirmation IN ('draft','confirmed') AND (confirmation <> 'confirmed' OR last_confirmed_at IS NOT NULL)",
                'attribute_version' => 'schema_version > 0 AND sort_order >= 0',
                'attribute_binding' => "native_binding IS NULL OR (native_binding = field_key AND native_binding IN ('nickname','real_name','age_range','mbti','headline','bio','seeking','city','timezone')) OR (native_binding = 'primary_portfolio_link' AND field_key = 'portfolio_link')",
            ],
            'matcher_profile_revision' => [
                'revision_versions' => 'revision > 0 AND schema_version > 0',
                'revision_json' => "JSON_TYPE(snapshot_json) = 'OBJECT'",
            ],
            'matcher_profile_draft' => [
                'draft_versions' => 'base_revision >= 0 AND base_identity_version >= 0 AND draft_version >= 0',
                'draft_kind' => "draft_kind IN ('profile','identity')",
                'draft_status' => "status IN ('editing','confirmed','discarded')",
                'draft_origin' => "origin IN ('manual','onboarding','import','ai','rules','admin_proposal','migration')",
                'draft_json' => "JSON_TYPE(fields_json) = 'ARRAY'",
            ],
        ];
        foreach ($checks as $table => $items) {
            foreach ($items as $key => $expression) {
                $name = $this->constraint($key);
                $existing = $this->db->createCommand('SELECT cc.CHECK_CLAUSE, tc.ENFORCED FROM information_schema.CHECK_CONSTRAINTS cc JOIN information_schema.TABLE_CONSTRAINTS tc ON tc.CONSTRAINT_SCHEMA=cc.CONSTRAINT_SCHEMA AND tc.CONSTRAINT_NAME=cc.CONSTRAINT_NAME WHERE tc.TABLE_SCHEMA=DATABASE() AND tc.TABLE_NAME=:table AND tc.CONSTRAINT_NAME=:name', [':table' => $this->table($table), ':name' => $name])->queryOne();
                if ($existing === false) {
                    $sql = 'ALTER TABLE ' . $this->db->quoteTableName($this->table($table)) . ' ADD CONSTRAINT ' . $this->db->quoteColumnName($name) . ' CHECK (' . $expression . ')';
                    $this->db->createCommand($sql)->execute();
                } elseif ($existing['ENFORCED'] !== 'YES' || $this->normalizeExpression($existing['CHECK_CLAUSE']) !== $this->normalizeExpression($expression)) {
                    throw new RuntimeException('Existing CHECK constraint conflicts: ' . $name);
                }
            }
        }
    }

    private function installForeignKeys(): void
    {
        $foreignKeys = [
            ['state_user_fk', 'matcher_profile_state', ['user_id'], User::tableName(), ['id'], true],
            ['state_space_fk', 'matcher_profile_state', ['space_id'], Space::tableName(), ['id'], true],
            ['attribute_state_fk', 'matcher_profile_attribute', ['state_id','scope_key'], 'matcher_profile_state', ['id','scope_key'], false],
            ['revision_state_fk', 'matcher_profile_revision', ['state_id'], 'matcher_profile_state', ['id'], false],
            ['state_revision_fk', 'matcher_profile_state', ['id','current_revision_id'], 'matcher_profile_revision', ['state_id','id'], false],
            ['draft_state_fk', 'matcher_profile_draft', ['state_id'], 'matcher_profile_state', ['id'], false],
            ['draft_initiator_fk', 'matcher_profile_draft', ['initiator_id'], User::tableName(), ['id'], true],
        ];
        foreach ($foreignKeys as [$key, $table, $columns, $target, $targetColumns, $native]) {
            $name = $this->constraint($key);
            $target = $native ? $target : $this->table($target);
            $rows = $this->db->createCommand('SELECT k.COLUMN_NAME,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,r.DELETE_RULE,r.UPDATE_RULE FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND k.TABLE_NAME=:table AND k.CONSTRAINT_NAME=:name ORDER BY k.ORDINAL_POSITION', [':table' => $this->table($table), ':name' => $name])->queryAll();
            if ($rows === []) {
                $this->db->createCommand()->addForeignKey($name, $this->table($table), $columns, $target, $targetColumns, 'RESTRICT', 'RESTRICT')->execute();
            } elseif (array_column($rows, 'COLUMN_NAME') !== $columns || array_column($rows, 'REFERENCED_COLUMN_NAME') !== $targetColumns || $rows[0]['REFERENCED_TABLE_NAME'] !== $target || $rows[0]['DELETE_RULE'] !== 'RESTRICT' || $rows[0]['UPDATE_RULE'] !== 'RESTRICT') {
                throw new RuntimeException('Existing foreign key conflicts: ' . $name);
            }
        }
    }

    private function table(string $name): string { return $this->db->tablePrefix . $name; }
    private function constraint(string $name): string
    {
        return 'mp_' . ($this->db->tablePrefix === '' ? '' : substr(hash('sha256', $this->db->tablePrefix), 0, 8) . '_') . $name;
    }
    private function normalizeType(string $type): string
    {
        return strtolower(preg_replace('/\b(tinyint|smallint|mediumint|int|bigint)\(\d+\)/i', '$1', $type));
    }
    private function normalizeExpression(string $expression): string
    {
        $expression = str_replace(chr(92) . chr(39), chr(39), $expression);
        $expression = str_replace(chr(92) . chr(34), chr(34), $expression);
        $expression = preg_replace('/_(?:utf8mb4|utf8mb3|ascii|latin1)(?=\s*[\x27\x22])/i', '', $expression);
        $expression = preg_replace('/\bcharset\s+\w+/i', '', $expression);
        return strtolower(preg_replace('/[\s\x60()]+/', '', $expression));
    }
}
