<?php

declare(strict_types=1);

use humhub\modules\matcherProfile\adapters\persistence\ProfileSchemaInstaller;
use humhub\modules\matcherProfile\domain\FieldCatalog;
use humhub\modules\user\models\Profile;
use humhub\modules\user\models\ProfileField;
use yii\db\Connection;

// Only a disposable, externally restored database is accepted. No credentials are printed.
$target = $argv[1] ?? '';
if (!preg_match('/^humhub_profile_s1_test_[a-z0-9_]+$/D', $target)) {
    fwrite(STDERR, "Usage: php run.php humhub_profile_s1_test_<suffix>\n");
    exit(2);
}
$backend = dirname(__DIR__, 5);
$app = require $backend . '/deploy/app.php';
$original = $app->db;
$dsn = preg_replace('/dbname=[^;]*/', 'dbname=' . $target, $original->dsn, 1, $replaced);
if ($replaced !== 1 || $dsn === $original->dsn) {
    throw new RuntimeException('Test database must be distinct from the preview database.');
}
$db = new Connection([
    'dsn' => $dsn, 'username' => $original->username, 'password' => $original->password,
    'charset' => $original->charset, 'tablePrefix' => $original->tablePrefix,
    'enableSchemaCache' => false, 'enableLogging' => false, 'enableProfiling' => false,
]);
$app->set('db', $db);
$app->set('cache', new yii\caching\ArrayCache());
foreach ($app->log->targets as $logTarget) { $logTarget->enabled = false; }
if ($db->createCommand('SELECT DATABASE()')->queryScalar() !== $target) {
    throw new RuntimeException('Test database verification failed.');
}
Yii::setAlias('@humhub/modules/matcherProfile', dirname(__DIR__, 2));
Yii::setAlias('@matcher-user-profile', dirname(__DIR__, 2));

$passed = [];
$current = 'initialization';
$assert = static function (bool $condition, string $label) use (&$passed, &$current): void {
    $current = $label;
    if (!$condition) { throw new RuntimeException('Assertion failed: ' . $label); }
    $passed[] = $label;
};
$reject = static function (callable $operation, string $label) use ($assert): void {
    try { $operation(); } catch (yii\db\Exception | RuntimeException $exception) {
        $assert(true, $label);
        return;
    }
    $assert(false, $label);
};
$uuid = static function (): string {
    $h = bin2hex(random_bytes(16));
    return substr($h,0,8) . '-' . substr($h,8,4) . '-4' . substr($h,13,3) . '-a' . substr($h,17,3) . '-' . substr($h,20,12);
};
$table = static fn(string $name): string => $db->tablePrefix . $name;
$installer = static fn(): array => (new ProfileSchemaInstaller($db))->install();
$transaction = null;
try {
    $originalColumns = array_keys($db->schema->getTableSchema(Profile::tableName(), true)->columns);
    $existing = (new yii\db\Query())->select($originalColumns)->from(Profile::tableName())->orderBy('user_id')->all($db);
    $current = 'first_install';
    $installed = $installer();
    $assert($installed['core_tables'] === 4, 'first_install_four_tables');
    $after = (new yii\db\Query())->select($originalColumns)->from(Profile::tableName())->orderBy('user_id')->all($db);
    $assert($existing === $after, 'native_values_preserved');
    $newFields = ProfileField::find()->where(['module_id' => 'matcher-user-profile'])->all();
    $assert(count($newFields) === 4, 'four_owned_native_fields');
    foreach ($newFields as $field) {
        $assert((int)$field->visible === 0 && (int)$field->editable === 0 && (int)$field->searchable === 0 && (int)$field->show_at_registration === 0, 'native_hidden_' . $field->internal_name);
    }
    $assert((int)ProfileField::findOne(['internal_name'=>'title'])->fieldType->maxLength === 160, 'headline_160');
    foreach (['firstname','lastname'] as $name) {
        $field = ProfileField::findOne(['internal_name'=>$name]);
        $assert((int)$field->required === 0 && (int)$field->fieldType->maxLength === 120, $name . '_optional_120');
    }
    $current = 'repeat_install';
    $again = $installer();
    $assert($again['operations'] === [], 'repeat_install_no_new_tables');
    $assert((int)ProfileField::find()->where(['module_id'=>'matcher-user-profile'])->count() === 4, 'repeat_no_duplicate_fields');

    $users = $db->createCommand('SELECT id FROM ' . $db->quoteTableName(humhub\modules\user\models\User::tableName()) . ' ORDER BY id LIMIT 2')->queryColumn();
    $spaceId = (int)$db->createCommand('SELECT id FROM ' . $db->quoteTableName(humhub\modules\space\models\Space::tableName()) . ' ORDER BY id LIMIT 1')->queryScalar();
    $assert(count($users) >= 2 && $spaceId > 0, 'clone_has_native_fixture_relationships');
    $transaction = $db->beginTransaction();
    $now = '2026-11-11 00:00:00.000000';
    $s1 = $uuid(); $s2 = $uuid(); $se = $uuid();
    $baseState = ['user_id'=>(int)$users[0], 'scope_key'=>'global', 'created_at'=>$now, 'updated_at'=>$now];
    $db->createCommand()->insert($table('matcher_profile_state'), ['id'=>$s1] + $baseState)->execute();
    $db->createCommand()->insert($table('matcher_profile_state'), ['id'=>$s2, 'user_id'=>(int)$users[1]] + $baseState)->execute();
    $db->createCommand()->insert($table('matcher_profile_state'), ['id'=>$se,'scope_key'=>'space:'.$spaceId,'space_id'=>$spaceId] + $baseState)->execute();
    $reject(fn()=> $db->createCommand()->insert($table('matcher_profile_state'), ['id'=>$uuid()] + $baseState)->execute(), 'duplicate_owner_scope_rejected');
    $reject(fn()=> $db->createCommand()->insert($table('matcher_profile_state'), ['id'=>$uuid(),'scope_key'=>'space:999','space_id'=>$spaceId] + $baseState)->execute(), 'scope_space_mismatch_rejected');
    $reject(fn()=> $db->createCommand()->insert($table('matcher_profile_state'), ['id'=>$uuid(),'user_id'=>2147483647] + $baseState)->execute(), 'unknown_user_rejected');
    $reject(fn()=> $db->createCommand()->update($table('matcher_profile_state'), ['permission_version'=>-1],['id'=>$s1])->execute(), 'negative_version_rejected');
    $reject(fn()=> $db->createCommand()->update($table('matcher_profile_state'), ['identity_version'=>1],['id'=>$se])->execute(), 'event_identity_rejected');
    $native = ['state_id'=>$s1,'scope_key'=>'global','field_key'=>'headline','storage_kind'=>'native','native_binding'=>'headline'];
    $db->createCommand()->insert($table('matcher_profile_attribute'), ['attribute_id'=>$uuid()] + $native)->execute();
    $reject(fn()=> $db->createCommand()->insert($table('matcher_profile_attribute'), ['attribute_id'=>$uuid()] + $native)->execute(), 'duplicate_native_binding_rejected');
    $reject(fn()=> $db->createCommand()->insert($table('matcher_profile_attribute'), ['attribute_id'=>$uuid(),'state_id'=>$se,'scope_key'=>'space:'.$spaceId] + $native)->execute(), 'event_native_binding_rejected');
    $reject(fn()=> $db->createCommand()->insert($table('matcher_profile_attribute'), ['attribute_id'=>$uuid(),'state_id'=>$se] + $native)->execute(), 'attribute_scope_state_mismatch_rejected');
    $nickname = ['attribute_id'=>$uuid(),'field_key'=>'nickname','native_binding'=>'nickname','visibility'=>'authenticated','confirmation'=>'confirmed','last_confirmed_at'=>$now] + $native;
    $db->createCommand()->insert($table('matcher_profile_attribute'), $nickname)->execute();
    $assert(true, 'confirmed_nickname_metadata_supported');
    $identityUser = humhub\modules\user\models\User::findOne((int)$users[0]);
    $neutralName = '成员·' . substr($identityUser->guid, -8);
    $db->createCommand()->update(Profile::tableName(), ['matcher_nickname'=>'协作测试昵称'], ['user_id'=>(int)$users[0]])->execute();
    $resolveName = static fn(): string => humhub\modules\matcherProfile\adapters\identity\NativeDisplayName::resolve($identityUser);
    $assert($resolveName() === $neutralName, 'nickname_requires_identity_version');
    $db->createCommand()->update($table('matcher_profile_state'), ['identity_version'=>1], ['id'=>$s1])->execute();
    $assert($resolveName() === '协作测试昵称', 'confirmed_native_nickname_displayed');
    $db->createCommand()->update($table('matcher_profile_attribute'), ['confirmation'=>'draft'], ['attribute_id'=>$nickname['attribute_id']])->execute();
    $assert($resolveName() === $neutralName, 'unconfirmed_native_nickname_neutral');
    $db->createCommand()->update($table('matcher_profile_attribute'), ['confirmation'=>'confirmed','visibility'=>'friends'], ['attribute_id'=>$nickname['attribute_id']])->execute();
    $assert($resolveName() === $neutralName, 'nonpublic_identity_marker_neutral');
    $db->createCommand()->update($table('matcher_profile_attribute'), ['visibility'=>'authenticated'], ['attribute_id'=>$nickname['attribute_id']])->execute();
    $reject(fn()=> $db->createCommand()->insert($table('matcher_profile_attribute'), ['attribute_id'=>$uuid(),'field_key'=>'nickname','native_binding'=>'city'] + $native)->execute(), 'nickname_wrong_binding_rejected');
    $inline = ['state_id'=>$s1,'scope_key'=>'global','field_key'=>'skill','storage_kind'=>'inline','value_json'=>new yii\db\JsonExpression(['code'=>'php','label'=>'PHP'])];
    $aid = $uuid();
    $db->createCommand()->insert($table('matcher_profile_attribute'), ['attribute_id'=>$aid] + $inline)->execute();
    $db->createCommand()->insert($table('matcher_profile_attribute'), ['attribute_id'=>$uuid()] + $inline)->execute();
    $assert((int)(new yii\db\Query())->from($table('matcher_profile_attribute'))->where(['state_id'=>$s1,'field_key'=>'skill'])->count('*',$db) === 2, 'repeated_skill_entries_supported');
    $assert((new yii\db\Query())->select('value_code')->from($table('matcher_profile_attribute'))->where(['attribute_id'=>$aid])->scalar($db) === 'php', 'value_code_generated');
    $reject(fn()=> $db->createCommand()->insert($table('matcher_profile_attribute'), ['attribute_id'=>$uuid(),'visibility'=>'public'] + $inline)->execute(), 'invalid_visibility_rejected');
    $reject(fn()=> $db->createCommand()->insert($table('matcher_profile_attribute'), ['attribute_id'=>$uuid(),'visibility'=>'PRIVATE'] + $inline)->execute(), 'visibility_case_rejected');
    $reject(fn()=> $db->createCommand()->insert($table('matcher_profile_attribute'), ['attribute_id'=>$uuid(),'confirmation'=>'confirmed'] + $inline)->execute(), 'confirmation_requires_time');
    $reject(fn()=> $db->createCommand()->insert($table('matcher_profile_attribute'), ['attribute_id'=>$uuid(),'value_json'=>null] + $inline)->execute(), 'inline_requires_value');
    $rid1 = $uuid(); $rid2 = $uuid();
    $revision = ['state_id'=>$s1,'revision'=>1,'snapshot_json'=>new yii\db\JsonExpression(['attributes'=>[]]), 'confirmed_at'=>$now,'created_at'=>$now];
    $db->createCommand()->insert($table('matcher_profile_revision'), ['id'=>$rid1] + $revision)->execute();
    $db->createCommand()->insert($table('matcher_profile_revision'), ['id'=>$rid2,'state_id'=>$s2] + $revision)->execute();
    $db->createCommand()->update($table('matcher_profile_state'), ['revision'=>1,'current_revision_id'=>$rid1],['id'=>$s1])->execute();
    $reject(fn()=> $db->createCommand()->update($table('matcher_profile_state'), ['current_revision_id'=>$rid2],['id'=>$s1])->execute(), 'cross_state_current_revision_rejected');
    $reject(fn()=> $db->createCommand()->delete($table('matcher_profile_revision'), ['id'=>$rid1])->execute(), 'referenced_revision_delete_rejected');
    $reject(fn()=> $db->createCommand()->insert($table('matcher_profile_revision'), ['id'=>$uuid()] + $revision)->execute(), 'duplicate_revision_rejected');
    $reject(fn()=> $db->createCommand()->insert($table('matcher_profile_revision'), ['id'=>$uuid(),'revision'=>2,'snapshot_json'=>new yii\db\JsonExpression([])] + $revision)->execute(), 'snapshot_requires_object');
    $draft = ['state_id'=>$s1,'base_revision'=>1,'base_identity_version'=>0,'fields_json'=>new yii\db\JsonExpression([]),'origin'=>'manual','initiator_id'=>(int)$users[0],'created_at'=>$now,'updated_at'=>$now];
    $db->createCommand()->insert($table('matcher_profile_draft'), ['id'=>$uuid()] + $draft)->execute();
    $reject(fn()=> $db->createCommand()->insert($table('matcher_profile_draft'), ['id'=>$uuid(),'fields_json'=>new yii\db\JsonExpression((object)[])] + $draft)->execute(), 'draft_requires_field_array');
    $reject(fn()=> $db->createCommand()->insert($table('matcher_profile_draft'), ['id'=>$uuid(),'status'=>'done'] + $draft)->execute(), 'draft_status_rejected');
    $transaction->rollBack();
    $transaction = null;
    $assert((int)(new yii\db\Query())->from($table('matcher_profile_state'))->count('*',$db) === 0, 'fixture_transaction_restored');

    // Simulate interrupted type DDL: owned definition exists, physical column is absent.
    $current = 'partial_native_field_retry';
    $assert((int)(new yii\db\Query())->from(Profile::tableName())->where(['not',['matcher_mbti'=>null]])->count('*',$db) === 0, 'retry_fixture_column_empty');
    $db->createCommand()->dropColumn(Profile::tableName(), 'matcher_mbti')->execute();
    $db->schema->refreshTableSchema(Profile::tableName());
    $installer();
    $assert($db->schema->getTableSchema(Profile::tableName(), true)->getColumn('matcher_mbti') !== null, 'partial_native_field_recovered');
    $current = 'partial_constraints_retry';
    $prefix = $db->tablePrefix === '' ? 'mp_' : 'mp_' . substr(hash('sha256',$db->tablePrefix),0,8) . '_';
    $db->createCommand()->dropIndex($prefix.'attribute_field_sort', $table('matcher_profile_attribute'))->execute();
    $db->createCommand('ALTER TABLE ' . $db->quoteTableName($table('matcher_profile_draft')) . ' DROP CHECK ' . $db->quoteColumnName($prefix.'draft_status'))->execute();
    $installer();
    $assert(true, 'interrupted_index_check_recovered');

    $current = 'field_conflict_detection';
    $field = ProfileField::findOne(['internal_name'=>'matcher_mbti']);
    $oldClass = $field->field_type_class;
    $db->createCommand()->update(ProfileField::tableName(), ['field_type_class'=>'humhub\\modules\\user\\models\\fieldtype\\Text'],['id'=>$field->id])->execute();
    try { $reject($installer, 'conflicting_field_type_rejected'); }
    finally { $db->createCommand()->update(ProfileField::tableName(), ['field_type_class'=>$oldClass],['id'=>$field->id])->execute(); }
    $current = 'column_conflict_detection';
    $db->createCommand()->alterColumn($table('matcher_profile_draft'),'origin','varchar(33) NOT NULL')->execute();
    try { $reject($installer, 'conflicting_table_shape_rejected'); }
    finally { $db->createCommand()->alterColumn($table('matcher_profile_draft'),'origin','varchar(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL')->execute(); }
    $installer();
    $after = (new yii\db\Query())->select($originalColumns)->from(Profile::tableName())->orderBy('user_id')->all($db);
    $assert($existing === $after, 'recovery_preserves_all_native_values');
    require_once dirname(__DIR__,2) . '/migrations/m261111_000001_profile_foundation.php';
    ob_start();
    $down = (new m261111_000001_profile_foundation(['db'=>$db]))->down();
    ob_end_clean();
    $assert($down === false && $db->schema->getTableSchema($table('matcher_profile_state'),true) !== null, 'destructive_down_refused');
    echo json_encode(['status'=>'passed','checks'=>count($passed),'passed'=>$passed,'native_profile_values_preserved'=>true],JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE) . "\n";
} catch (Throwable $error) {
    if ($transaction?->isActive) { $transaction->rollBack(); }
    fwrite(STDERR,json_encode(['status'=>'failed','at'=>$current,'passed'=>count($passed),'error_type'=>get_class($error),'reason'=>get_class($error) === RuntimeException::class ? $error->getMessage() : 'Database/runtime operation failed; raw details suppressed'],JSON_UNESCAPED_UNICODE) . "\n");
    exit(1);
}
