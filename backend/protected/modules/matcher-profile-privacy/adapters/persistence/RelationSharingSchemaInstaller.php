<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\adapters\persistence;
use humhub\modules\matcherProfile\adapters\persistence\WorkflowSchemaSupport;
use yii\db\Connection;
final class RelationSharingSchemaInstaller
{
    public function __construct(private Connection $db) {}
    public function install(): array
    {
        $ddl = new WorkflowSchemaSupport($this->db);
        return $ddl->install('relation-sharing', function () use ($ddl): array {
            $user = $ddl->nativeKey('user'); $space = $ddl->nativeKey('space'); $table = 'matcher_profile_relation_sharing';
            $ddl->table($table, ['id' => 'char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL', 'owner_id' => "$user NOT NULL", 'space_id' => "$space NOT NULL", 'kind' => 'varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL', 'object_id' => 'varchar(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL', 'version' => 'bigint NOT NULL', 'visibility' => "varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'private'", 'PRIMARY KEY (id)']);
            $ddl->index($table, 'relation_sharing_object', ['owner_id', 'space_id', 'kind', 'object_id'], true);
            $ddl->foreignKey($table, 'relation_sharing_owner_fk', 'owner_id', 'user');
            $ddl->foreignKey($table, 'relation_sharing_space_fk', 'space_id', 'space');
            $ddl->check($table, 'relation_sharing_kind', "kind IN ('activities','idea_groups')");
            $ddl->check($table, 'relation_sharing_visibility', "visibility IN ('authenticated','friends','private')");
            $ddl->check($table, 'relation_sharing_version', 'version >= 1');
            return ['relation_sharing_tables' => 1, 'profile_values_changed' => false];
        });
    }
}
