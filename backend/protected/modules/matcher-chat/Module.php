<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat;

use humhub\modules\matcherChat\adapters\http\SessionActor;
use humhub\modules\matcherChat\adapters\native\{DirectAdmission, EntryCoverage, GuardedPollController, NativeSendEligibility, NativeFileStore};
use humhub\modules\matcherChat\adapters\persistence\{SqlReadStore, SqlSendStore, SqlState, SqlAttachmentStore, SqlGroupStore};
use humhub\modules\matcherChat\adapters\security\{HmacCursorCodec, SystemClock};
use humhub\modules\matcherChat\application\{ChatReader, ChatSender, ChatAttachments, ChatGroups, EntryPolicy};
use humhub\modules\matcherChat\domain\{ChatException, GroupPolicy, PageRequest};
use Yii;

final class Module extends \humhub\components\Module
{
    public const EVENT_ENTRY_READINESS = 'entryReadiness';
    public bool $integrationReady = false;
    public bool $entryTakeoverEnabled = false;
    public bool $sendEnabled = false;
    public bool $attachmentsEnabled = false;
    public bool $groupsEnabled = false;
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
    /** Group lifecycle is independent of direct-message read/send switches. */
    public function isGroupsEnabled(): bool
    {
        return $this->groupsEnabled && in_array($this->settings->getUncached('groupsEnabled'), ['1', 'true'], true)
            && Yii::$app instanceof \yii\web\Application && Yii::$app->hasModule('mail') && $this->pollProtectionReady();
    }
    public function groups(int $viewerId): ChatGroups
    {
        SessionActor::requireSelf($viewerId);
        if (!$this->isGroupsEnabled()) { throw new ChatException('CHAT_GROUPS_UNAVAILABLE', 'Group lifecycle is unavailable.', 503); }
        $store = new SqlGroupStore($this->sql(), $viewerId, $this->groupsEnabled);
        if (!$store->ready()) { throw new ChatException('CHAT_GROUPS_UNAVAILABLE', 'Group storage is unavailable.', 503); }
        return new ChatGroups($store, $store, $store, new GroupPolicy(259200, 50, 50));
    }
    public function isSendingEnabled(): bool
    {
        return $this->sendEnabled && in_array($this->settings->getUncached('sendEnabled'), ['1', 'true'], true)
            && $this->isReadingEnabled() && (new NativeSendEligibility($this->sql(), true))->ready();
    }
    public function sender(int $viewerId): ChatSender
    {
        if (!$this->isSendingEnabled()) { throw new ChatException('CHAT_SEND_UNAVAILABLE', 'Text sending is unavailable.', 503); }
        $reads = $this->readStore($viewerId);
        $writes = new SqlSendStore($this->sql(), $reads, $viewerId, new SqlAttachmentStore($this->sql(), $reads, $viewerId, $this->isAttachmentsEnabled()));
        return new ChatSender($reads, $reads, $writes, $writes);
    }
    public function isAttachmentsEnabled(): bool
    {
        return $this->attachmentsEnabled && in_array($this->settings->getUncached('attachmentsEnabled'), ['1', 'true'], true)
            && $this->isSendingEnabled() && $this->attachmentDownloadsReady();
    }
    public function attachmentDownloadsReady(): bool { return $this->sql()->attachmentsReady() && NativeFileStore::ready(); }
    public function attachments(int $viewerId): ChatAttachments
    {
        if (!$this->schemaReady() || !$this->sql()->attachmentsReady()) { throw new ChatException('CHAT_ATTACHMENTS_UNAVAILABLE', 'Attachment metadata is unavailable.', 503); }
        return new ChatAttachments(new SqlAttachmentStore($this->sql(), $this->readStore($viewerId), $viewerId, $this->isAttachmentsEnabled()));
    }
    private function readStore(int $viewerId): SqlReadStore
    {
        $ready = $this->attachmentDownloadsReady();
        return new SqlReadStore($this->sql(), $viewerId, new NativeSendEligibility($this->sql(), $this->sendEnabled), $this->attachmentsEnabled && $ready, $ready);
    }
    public function isEntryTakeoverEnabled(): bool
    {
        return EntryPolicy::enabled($this->entryTakeoverEnabled, $this->settings->get('entryTakeoverEnabled'));
    }

    /** Host UI may consume this summary; only the current native session is accepted. */
    public function entryStatus(int $viewerId, bool $uiReady): array
    {
        $coverage = ['native_total' => 0, 'managed_total' => 0, 'unmanaged_total' => 0, 'revoked_total' => 0];
        $enabled = $this->entryTakeoverEnabled;
        $baseUrl = Yii::$app instanceof \yii\web\Application ? Yii::$app->request->baseUrl : '';
        try {
            $enabled = $this->isEntryTakeoverEnabled();
            SessionActor::requireSelf($viewerId);
            if (!$enabled) { return EntryPolicy::status(false, false, false, $coverage, $baseUrl); }
            $scope = (new EntryCoverage($this->sql()))->inspect($viewerId);
            $coverage = $scope['coverage'];
            $ready = $uiReady && $this->isReadingEnabled() && $this->pollProtectionReady();
            if ($ready && $scope['affected']) {
                // A count is not authority. The native reader synchronizes and checks grants.
                $this->reader($viewerId)->conversations($viewerId, new PageRequest(1), 'entry-coverage');
            }
            return EntryPolicy::status($enabled, $scope['affected'], $ready, $coverage, $baseUrl);
        } catch (\Throwable) {
            // Menu rendering cannot turn a chat dependency failure into a site outage.
            return EntryPolicy::status($enabled, true, false, $coverage, '');
        }
    }

    /** Install before controller construction; do not overwrite a third-party mapping. */
    public function installPollProtection(): bool
    {
        if (!Yii::$app instanceof \yii\web\Application || !Yii::$app->hasModule('live')) { return false; }
        $live = Yii::$app->getModule('live');
        $current = $live->controllerMap['poll'] ?? null;
        if ($current === GuardedPollController::class) { return true; }
        if ($current !== null && $current !== \humhub\modules\live\controllers\PollController::class) { return false; }
        $live->controllerMap['poll'] = GuardedPollController::class;
        return true;
    }

    public function pollProtectionReady(): bool
    {
        return $this->installPollProtection() && Yii::$app->live->driver instanceof \humhub\modules\live\driver\Poll;
    }
    public function reader(int $viewerId): ChatReader
    {
        if (!$this->isReadingEnabled()) { throw new ChatException('CHAT_DEPENDENCY_UNAVAILABLE', 'Chat reading is not enabled.', 503); }
        $store = $this->readStore($viewerId);
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
