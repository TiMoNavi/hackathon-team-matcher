<?php
declare(strict_types=1);
use humhub\modules\matcherRecommendation\adapters\browse\DiscoverySettingsSchema;
final class m261112_000001_discovery_settings extends \yii\db\Migration
{
    public function up() { DiscoverySettingsSchema::install($this->db); }
    public function down() { DiscoverySettingsSchema::remove($this->db); }
}
