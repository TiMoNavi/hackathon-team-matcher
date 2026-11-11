<?php
declare(strict_types=1);
use humhub\modules\matcherProfile\adapters\persistence\AiJobSchemaInstaller;
final class m261111_000006_profile_ai_jobs extends \humhub\components\Migration
{
    public function up(): void { (new AiJobSchemaInstaller($this->db))->install(); }
    public function down(): bool { echo "AI jobs are retained; use a reviewed data handover.\n";return false; }
}
