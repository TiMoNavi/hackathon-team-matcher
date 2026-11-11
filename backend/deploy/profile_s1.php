<?php
/** CLI-only, anonymous schema inspection for the profile foundation. */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$action = $argv[1] ?? 'inspect';
if (!in_array($action, ['inspect', 'fingerprint', 'install'], true)) {
    fwrite(STDERR, "Supported actions: inspect, fingerprint, install\n");
    exit(2);
}

$app = require __DIR__ . '/app.php';
$db = $app->db;
if ($action === 'install') {
    $moduleId = $app->moduleManager->register(dirname(__DIR__) . '/protected/modules/matcher-user-profile');
    $module = $app->moduleManager->getModule($moduleId);
    if (!$module instanceof humhub\modules\matcherProfile\Module) {
        throw new RuntimeException('Profile module registration failed.');
    }
    if (!$module->isEnabled) {
        $module->enable();
    } else {
        // The same foundation is verified on retry; incompatible structures are rejected.
        (new humhub\modules\matcherProfile\adapters\persistence\ProfileSchemaInstaller($db))->install();
    }
    echo json_encode(['module' => $moduleId, 'enabled' => (bool) $module->isEnabled, 'version' => $module->version], JSON_THROW_ON_ERROR) . PHP_EOL;
    exit;
}
if ($action === 'fingerprint') {
    $fingerprints = [];
    foreach (['user', 'profile', 'space', 'space_membership'] as $name) {
        $table = $db->schema->getTableSchema('{{%' . $name . '}}', true);
        $columns = array_values(array_filter(array_keys($table->columns), static fn(string $name): bool => !str_starts_with($name, 'matcher_')));
        sort($columns);
        $hash = hash_init('sha256');
        $count = 0;
        $rows = (new yii\db\Query())->select($columns)->from('{{%' . $name . '}}')->orderBy(array_fill_keys($table->primaryKey, SORT_ASC));
        foreach ($rows->each(100, $db) as $row) {
            hash_update($hash, json_encode($row, JSON_THROW_ON_ERROR) . PHP_EOL);
            $count++;
        }
        $fingerprints[$name] = ['row_count' => $count, 'column_count' => count($columns), 'digest' => hash_final($hash)];
    }
    echo json_encode($fingerprints, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR) . PHP_EOL;
    exit;
}
$tables = [];
foreach (['user', 'profile', 'profile_field', 'profile_field_category', 'space', 'space_membership',
    'matcher_profile_state', 'matcher_profile_attribute', 'matcher_profile_revision', 'matcher_profile_draft'] as $name) {
    $table = $db->schema->getTableSchema('{{%' . $name . '}}', true);
    if ($table === null) {
        $tables[$name] = ['exists' => false];
        continue;
    }
    $columns = [];
    foreach ($table->columns as $column) {
        $columns[$column->name] = [
            'db_type' => $column->dbType, 'nullable' => $column->allowNull,
            'primary_key' => $column->isPrimaryKey, 'default' => $column->defaultValue,
        ];
    }
    $tables[$name] = [
        'exists' => true, 'primary_key' => $table->primaryKey, 'columns' => $columns,
        'row_count' => (int) $db->createCommand('SELECT COUNT(*) FROM ' . $db->quoteTableName($table->fullName))->queryScalar(),
        'foreign_keys' => $table->foreignKeys,
    ];
}
$fields = (new yii\db\Query())->select(['internal_name', 'field_type_class', 'field_type_config', 'required', 'visible', 'editable', 'show_at_registration', 'searchable'])->from('{{%profile_field}}')->orderBy('internal_name')->all($db);
$report = [
    'captured_at_utc' => gmdate('c'),
    'humhub_version' => $app->version,
    'database_version' => $db->createCommand('SELECT VERSION()')->queryScalar(),
    'table_prefix' => $db->tablePrefix,
    'database_charset' => $db->createCommand('SELECT @@character_set_database')->queryScalar(),
    'database_collation' => $db->createCommand('SELECT @@collation_database')->queryScalar(),
    'profile_field_count' => count($fields),
    'profile_module_enabled' => (new yii\db\Query())->from('module_enabled')->where(['module_id' => 'matcher-user-profile'])->exists($db),
    'profile_fields' => $fields,
    'tables' => $tables,
];
echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . PHP_EOL;
