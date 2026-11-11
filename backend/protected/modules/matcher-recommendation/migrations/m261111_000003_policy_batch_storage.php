<?php
declare(strict_types=1);
use humhub\modules\matcherRecommendation\adapters\persistence\RecommendationStorageSchema;
use yii\db\Migration;

/** Only recommendation's draft/history/pointer/batch tables; no production policy is seeded. */
class m261111_000003_policy_batch_storage extends Migration
{
    public function up() { RecommendationStorageSchema::install($this->db); }
    public function down() { RecommendationStorageSchema::remove($this->db); }
}
