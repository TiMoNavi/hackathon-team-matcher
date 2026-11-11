<?php
use humhub\modules\matcherProfile\adapters\persistence\ProfileSchemaUpgradeV2;
class m261111_000002_profile_service extends \humhub\components\Migration
{
    public function up() { (new ProfileSchemaUpgradeV2($this->db))->install(); return true; }
    public function down() { echo "S2 profile data is retained; restore a reviewed private backup for rollback.\n"; return false; }
}
