<?php
declare(strict_types=1);
final class m261112_000007_profile_presentation extends \humhub\components\Migration
{
    public function up(): void { (new \humhub\modules\matcherProfile\adapters\persistence\PresentationSchemaInstaller($this->db))->install(); }
    public function down(): bool { echo "Presentation choices are retained; use a reviewed data handover.\n"; return false; }
}
