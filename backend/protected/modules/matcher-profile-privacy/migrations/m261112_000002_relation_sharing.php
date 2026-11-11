<?php
declare(strict_types=1);
final class m261112_000002_relation_sharing extends \humhub\components\Migration
{
    public function up(): void { (new \humhub\modules\matcherPrivacy\adapters\persistence\RelationSharingSchemaInstaller($this->db))->install(); }
    public function down(): bool { echo "Relation sharing choices are retained; use a reviewed data handover.\n"; return false; }
}
