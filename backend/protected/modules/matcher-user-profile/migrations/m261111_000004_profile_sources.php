<?php
use humhub\modules\matcherProfile\adapters\persistence\SourceSchemaInstaller;
class m261111_000004_profile_sources extends \humhub\components\Migration
{
    public function up() { (new SourceSchemaInstaller($this->db))->install(); return true; }
    public function down() { echo "Private sources are retained; restore a reviewed private backup for rollback." . PHP_EOL; return false; }
}
