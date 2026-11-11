<?php
declare(strict_types=1);
use humhub\modules\matcherPrivacy\adapters\persistence\PrivacySchemaInstaller;
final class m261111_000001_privacy_projection extends \yii\db\Migration
{
    public function safeUp() { (new PrivacySchemaInstaller($this->db))->install(); }
    public function safeDown() { throw new LogicException('Privacy retirement requires a reviewed replacement projection and retained profile data.'); }
}
