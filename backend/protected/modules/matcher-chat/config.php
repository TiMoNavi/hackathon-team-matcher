<?php
declare(strict_types=1);
use humhub\modules\matcherChat\Events;

return [
    'id' => 'matcher-chat',
    'class' => \humhub\modules\matcherChat\Module::class,
    'namespace' => 'humhub\modules\matcherChat',
    'consoleControllerMap' => ['chat-attachment' => \humhub\modules\matcherChat\commands\ChatAttachmentController::class],
    'urlManagerRules' => [
        'api/v1/conversations' => 'matcher-chat/api/conversations',
        'api/v1/conversations/<id:\d+>/messages' => 'matcher-chat/api/messages',
        'api/v1/conversations/<id:\d+>/read-state' => 'matcher-chat/api/read-state',
        'api/v1/conversations/<id:\d+>/attachments' => 'matcher-chat/api/attachments',
        'api/v1/conversations/<id:\d+>/attachments/<attachmentId:[0-9a-f-]{36}>' => 'matcher-chat/api/attachment',
        'api/v1/conversations/<id:\d+>/attachments/<attachmentId:[0-9a-f-]{36}>/download' => 'matcher-chat/api/attachment-download',
    ],
    'events' => [
        [\humhub\components\Application::class, \yii\base\Application::EVENT_BEFORE_REQUEST, [Events::class, 'beforeRequest']],
        [\yii\base\Module::class, \yii\base\Module::EVENT_BEFORE_ACTION, [Events::class, 'beforeAction']],
        [\humhub\modules\mail\models\Message::class, \yii\db\BaseActiveRecord::EVENT_BEFORE_UPDATE, [Events::class, 'beforeNativeWrite']],
        [\humhub\modules\mail\models\Message::class, \yii\db\BaseActiveRecord::EVENT_BEFORE_DELETE, [Events::class, 'beforeNativeWrite']],
        [\humhub\modules\mail\models\AbstractMessageEntry::class, \yii\db\BaseActiveRecord::EVENT_BEFORE_INSERT, [Events::class, 'beforeNativeWrite']],
        [\humhub\modules\mail\models\AbstractMessageEntry::class, \yii\db\BaseActiveRecord::EVENT_BEFORE_UPDATE, [Events::class, 'beforeNativeWrite']],
        [\humhub\modules\mail\models\AbstractMessageEntry::class, \yii\db\BaseActiveRecord::EVENT_BEFORE_DELETE, [Events::class, 'beforeNativeWrite']],
        [\humhub\modules\mail\models\UserMessage::class, \yii\db\BaseActiveRecord::EVENT_BEFORE_INSERT, [Events::class, 'beforeNativeWrite']],
        [\humhub\modules\mail\models\UserMessage::class, \yii\db\BaseActiveRecord::EVENT_BEFORE_UPDATE, [Events::class, 'beforeNativeWrite']],
        [\humhub\modules\mail\models\UserMessage::class, \yii\db\BaseActiveRecord::EVENT_BEFORE_DELETE, [Events::class, 'beforeNativeWrite']],
        [\humhub\modules\file\models\File::class, \yii\db\BaseActiveRecord::EVENT_BEFORE_INSERT, [Events::class, 'beforeNativeWrite']],
        [\humhub\modules\file\models\File::class, \yii\db\BaseActiveRecord::EVENT_BEFORE_UPDATE, [Events::class, 'beforeNativeWrite']],
        [\humhub\modules\file\models\File::class, \yii\db\BaseActiveRecord::EVENT_BEFORE_DELETE, [Events::class, 'beforeNativeWrite']],
        [\humhub\modules\file\models\File::class, 'beforeStorageMutation', [Events::class, 'beforeStorageMutation']],
        [\humhub\modules\file\models\File::class, 'beforeStorageRead', [Events::class, 'beforeStorageRead']],
        [\humhub\modules\user\models\User::class, \yii\db\BaseActiveRecord::EVENT_BEFORE_UPDATE, [Events::class, 'beforeIdentityChange']],
        [\humhub\modules\user\models\User::class, \yii\db\BaseActiveRecord::EVENT_BEFORE_DELETE, [Events::class, 'beforeIdentityChange']],
        [\humhub\modules\mail\widgets\NotificationInbox::class, \yii\base\Widget::EVENT_BEFORE_RUN, [Events::class, 'beforeInboxWidget']],
    ],
];
