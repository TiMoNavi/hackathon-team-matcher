<?php
declare(strict_types=1);
use humhub\modules\matcherRecommendation\adapters\index\CandidateIndexSchema;
use yii\db\Migration;

/** Opt-in migration for recommendation-owned derived tables only. */
class m261111_000001_candidate_index extends Migration
{
    public function up() { CandidateIndexSchema::install($this->db); }
    public function down() { CandidateIndexSchema::remove($this->db); }
}
