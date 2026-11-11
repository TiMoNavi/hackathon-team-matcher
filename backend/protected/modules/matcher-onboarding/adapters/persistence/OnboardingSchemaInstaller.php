<?php
declare(strict_types=1);
namespace humhub\modules\matcherOnboarding\adapters\persistence;

use humhub\modules\matcherProfile\adapters\persistence\WorkflowSchemaSupport;
use yii\db\Connection;

/** Workflow progress references existing profile records; it does not copy their values. */
final class OnboardingSchemaInstaller
{
    public function __construct(private Connection $db) {}
    public function install(): array
    {
        $ddl = new WorkflowSchemaSupport($this->db);
        return $ddl->install('onboarding', function () use ($ddl): array {
            $uuid = 'char(36) CHARACTER SET ascii COLLATE ascii_bin'; $user = $ddl->nativeKey('user'); $space = $ddl->nativeKey('space');
            $table = 'matcher_onboarding_session';
            $ddl->table($table, [
                'id' => "$uuid NOT NULL", 'owner_id' => "$user NOT NULL", 'scope_key' => 'varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL',
                'space_id' => "$space NULL", 'version' => 'bigint NOT NULL', 'stage' => 'varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL',
                'max_stage' => 'varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL', 'status' => 'varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL',
                'resource_refs_json' => 'json NOT NULL', 'created_at' => 'datetime(6) NOT NULL', 'updated_at' => 'datetime(6) NOT NULL',
                'completed_at' => 'datetime(6) NULL', 'PRIMARY KEY (id)',
            ]);
            $ddl->index($table, 'session_owner_scope', ['owner_id', 'scope_key', 'status', 'updated_at', 'id']);
            $ddl->foreignKey($table, 'session_owner_fk', 'owner_id', 'user');
            $ddl->foreignKey($table, 'session_space_fk', 'space_id', 'space');
            $ddl->check($table, 'session_version', 'version >= 1');
            $ddl->check($table, 'session_status', "status IN ('active','completed')");
            $ddl->check($table, 'session_stage', "stage IN ('materials','review','questions','draft','privacy','completed') AND max_stage IN ('materials','review','questions','draft','privacy','completed')");
            $ddl->check($table, 'session_scope', "(space_id IS NULL AND scope_key = 'global') OR (space_id IS NOT NULL AND scope_key = CONCAT('space:',space_id))");
            return ['onboarding_tables' => 1, 'profile_values_copied' => false];
        });
    }
}
