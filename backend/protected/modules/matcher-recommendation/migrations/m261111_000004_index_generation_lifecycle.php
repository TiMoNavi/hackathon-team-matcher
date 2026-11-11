<?php
declare(strict_types=1);
use humhub\modules\matcherRecommendation\adapters\index\CandidateIndexLifecycleSchema;
use yii\db\Migration;

/** Opt-in generation metadata only. Legacy untracked rows require an explicit stopped-module procedure. */
class m261111_000004_index_generation_lifecycle extends Migration
{
    public function up() { CandidateIndexLifecycleSchema::install($this->db); }
    public function down() { CandidateIndexLifecycleSchema::remove($this->db); }
}
