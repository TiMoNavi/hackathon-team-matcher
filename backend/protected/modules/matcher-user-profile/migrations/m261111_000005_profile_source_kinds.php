<?php
use humhub\modules\matcherProfile\adapters\persistence\SourceKindSchemaUpgrade;

class m261111_000005_profile_source_kinds extends \humhub\components\Migration
{
    public function up() { (new SourceKindSchemaUpgrade($this->db))->install(); return true; }
    public function down() { echo "The source kind upgrade preserves private sources; restore a reviewed private backup for rollback." . PHP_EOL; return false; }
}
