<?php
declare(strict_types=1);
use humhub\modules\matcherRecommendation\adapters\analysis\SelfAnalysisSelectionSchema;
use yii\db\Migration;

/** Explicit module-owned installation only; runtime requests never create this table. */
final class m261112_220000_self_analysis_selection extends Migration
{
    public function up(): void { SelfAnalysisSelectionSchema::install($this->db); }
    public function down(): void { SelfAnalysisSelectionSchema::remove($this->db); }
}
