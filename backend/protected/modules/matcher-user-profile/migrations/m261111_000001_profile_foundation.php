<?php

use humhub\modules\matcherProfile\adapters\persistence\ProfileSchemaInstaller;

/** MySQL DDL is not transactionally rolled back; the installer supports verified retry. */
class m261111_000001_profile_foundation extends \humhub\components\Migration
{
    public function up()
    {
        (new ProfileSchemaInstaller($this->db))->install();
        return true;
    }

    public function down()
    {
        echo "Profile data is retained. Use the documented backup and reviewed migration handover.\n";
        return false;
    }
}
