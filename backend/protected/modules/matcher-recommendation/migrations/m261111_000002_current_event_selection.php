<?php
declare(strict_types=1);
use humhub\modules\matcherRecommendation\adapters\native\CurrentEventSelectionSchema;
use yii\db\Migration;

/** Explicit installation only; no native HumHub table changes. */
final class m261111_000002_current_event_selection extends Migration
{
    public function up(): void { CurrentEventSelectionSchema::install($this->db); }
    public function down(): void { CurrentEventSelectionSchema::remove($this->db); }
}
