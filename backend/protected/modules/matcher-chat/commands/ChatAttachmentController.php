<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\commands;

use humhub\modules\matcherChat\adapters\persistence\{SqlAttachmentStore, SqlReadStore};
use humhub\modules\matcherChat\domain\SafeInteger;

/** Explicit operator cleanup; does not start a background worker or retry uploads. */
final class ChatAttachmentController extends \yii\console\Controller
{
    public int $limit = 100;
    public function options($actionID) { return array_merge(parent::options($actionID), ['limit']); }
    public function actionCleanup(): int
    {
        if ($this->limit < 1 || $this->limit > 100) { throw new \InvalidArgumentException('Cleanup limit must be 1 to 100.'); }
        $module = \Yii::$app->getModule('matcher-chat');
        if (!$module instanceof \humhub\modules\matcherChat\Module || !$module->schemaReady() || !$module->sql()->attachmentsReady()) { throw new \RuntimeException('Attachment metadata is unavailable.'); }
        $sql = $module->sql();
        $rows = $sql->all('SELECT user_id,MIN(created_at) AS oldest FROM {{%matcher_chat_attachment}} WHERE cleaned_at IS NULL AND state<>:bound AND (expires_at<=UNIX_TIMESTAMP() OR state IN (:cancelled,:expired,:failed)) GROUP BY user_id ORDER BY oldest,user_id LIMIT ' . $this->limit, [':bound' => 'bound', ':cancelled' => 'cancelled', ':expired' => 'expired', ':failed' => 'failed']);
        $totals = ['selected' => 0, 'cleaned' => 0, 'pending' => 0];
        foreach ($rows as $row) {
            $remaining = $this->limit - $totals['selected']; if ($remaining <= 0) { break; }
            $viewer = SafeInteger::native($row['user_id'], 'user_id');
            $result = (new SqlAttachmentStore($sql, new SqlReadStore($sql, $viewer), $viewer, false))->cleanup($remaining, false);
            foreach ($totals as $key => $value) { $totals[$key] += $result[$key]; }
        }
        $this->stdout(json_encode($totals, JSON_THROW_ON_ERROR) . PHP_EOL);
        return $totals['pending'] === 0 ? 0 : 1;
    }
}
