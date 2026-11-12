<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat;

use humhub\modules\matcherChat\adapters\native\DirectAdmission;
use humhub\modules\matcherChat\adapters\persistence\{SqlReadStore, SqlState};
use humhub\modules\matcherChat\adapters\security\{HmacCursorCodec, SystemClock};
use humhub\modules\matcherChat\application\ChatReader;
use humhub\modules\matcherChat\domain\ChatException;
use Yii;

final class Module extends \humhub\components\Module
{
    public bool $integrationReady = false;
    public string $cursorSecret = '';
    public string $nativeTimeZone = 'UTC';
    private ?SqlState $sql = null;

    public function sql(): SqlState { return $this->sql ??= new SqlState(Yii::$app->db, $this->nativeTimeZone); }
    public function schemaReady(): bool { return $this->sql()->ready(); }
    public function isReadingEnabled(): bool
    {
        return $this->integrationReady && in_array($this->settings->get('readEnabled'), [true, 1, '1', 'true'], true) && strlen($this->cursorSecret) >= 32 && $this->schemaReady();
    }
    public function admission(): DirectAdmission { return new DirectAdmission($this->sql()); }
    public function reader(int $viewerId): ChatReader
    {
        if (!$this->isReadingEnabled()) { throw new ChatException('CHAT_DEPENDENCY_UNAVAILABLE', 'Chat reading is not enabled.', 503); }
        $store = new SqlReadStore($this->sql(), $viewerId);
        return new ChatReader($store, $store, new HmacCursorCodec($this->cursorSecret, new SystemClock()), $store);
    }
    public function disable()
    {
        if (!$this->schemaReady() || $this->sql()->one('SELECT message_id FROM {{%matcher_chat_conversation}} LIMIT 1') !== null) {
            throw new \LogicException('Managed conversation guards cannot be disabled. Disable matcher-chat-ui/readEnabled instead.');
        }
        return parent::disable();
    }
}
