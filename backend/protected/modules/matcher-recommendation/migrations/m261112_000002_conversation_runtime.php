<?php
declare(strict_types=1);
use humhub\modules\matcherRecommendation\adapters\conversation\{ConversationRuntimeSchema, ConversationStorageSchema};

/** Explicit install only; owned data retained by rollback to prevent accidental dialogue/quota reset. */
final class m261112_000002_conversation_runtime extends \yii\db\Migration
{
    public function up()
    {
        $driver = $this->db->driverName; $prefix = $this->db->tablePrefix;
        $this->db->createCommand(ConversationStorageSchema::sql($driver, $prefix))->execute();
        foreach (ConversationRuntimeSchema::statements($driver, $prefix) as $sql) { $this->db->createCommand($sql)->execute(); }
    }
    public function down() { return false; }
}
