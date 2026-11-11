<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\persistence;
use yii\db\Connection;
final class PresentationSchemaInstaller
{
    public function __construct(private Connection $db) {}
    public function install(): array
    {
        $ddl = new WorkflowSchemaSupport($this->db);
        return $ddl->install('presentation', function () use ($ddl): array {
            $user = $ddl->nativeKey('user'); $uuid = 'char(36) CHARACTER SET ascii COLLATE ascii_bin';
            $ddl->table('matcher_profile_presentation', ['id' => "$user NOT NULL", 'version' => 'bigint NOT NULL', 'education_attribute_id' => "$uuid NULL", 'primary_portfolio_attribute_id' => "$uuid NULL", 'PRIMARY KEY (id)']);
            $ddl->foreignKey('matcher_profile_presentation', 'presentation_owner_fk', 'id', 'user');
            $ddl->check('matcher_profile_presentation', 'presentation_version', 'version >= 1');
            // No FK to attributes: deletion retains the exact choice, preventing a fallback to another value.
            return ['presentation_tables' => 1, 'profile_values_changed' => false];
        });
    }
}
