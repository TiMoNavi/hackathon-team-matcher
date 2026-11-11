<?php
use humhub\modules\matcherOnboarding\adapters\persistence\OnboardingSchemaInstaller;
class m261111_000001_onboarding_sessions extends \humhub\components\Migration
{
    public function up() { (new OnboardingSchemaInstaller($this->db))->install(); return true; }
    public function down() { echo "Onboarding progress is retained; restore a reviewed private backup for rollback." . PHP_EOL; return false; }
}
