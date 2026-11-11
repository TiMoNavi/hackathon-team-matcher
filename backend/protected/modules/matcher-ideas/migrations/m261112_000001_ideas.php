<?php
declare(strict_types=1);
use humhub\modules\matcherIdeas\adapters\persistence\IdeaSchema;
final class m261112_000001_ideas extends \yii\db\Migration
{
    public function safeUp() { IdeaSchema::install($this->db); }
    public function safeDown() { throw new LogicException('Idea and binding data retirement requires a reviewed handover.'); }
}
