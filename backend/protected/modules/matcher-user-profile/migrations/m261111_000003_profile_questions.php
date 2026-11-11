<?php
use humhub\modules\matcherProfile\adapters\persistence\QuestionSchemaInstaller;
class m261111_000003_profile_questions extends \humhub\components\Migration
{
    public function up() { (new QuestionSchemaInstaller($this->db))->install(); return true; }
    public function down() { echo "Question and answer records are retained; restore a reviewed private backup for rollback." . PHP_EOL; return false; }
}
