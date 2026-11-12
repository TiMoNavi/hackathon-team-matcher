<?php
declare(strict_types=1);

return [
    'id' => 'matcher-chat-ui',
    'class' => \humhub\modules\matcherChatUi\Module::class,
    'namespace' => 'humhub\modules\matcherChatUi',
    'urlManagerRules' => [
        'matcher/chat' => 'matcher-chat-ui/app/index',
        // Catch local deep links only; the controller applies the exact path/method policy.
        'matcher/chat/<path:.*>' => 'matcher-chat-ui/app/index',
    ],
    'events' => [
        ['humhub\modules\matcherChat\Module', 'entryReadiness',
            [\humhub\modules\matcherChatUi\adapters\ui\EntryBridge::class, 'readiness']],
        [\humhub\widgets\TopMenu::class, \humhub\modules\ui\menu\widgets\Menu::EVENT_RUN,
            [\humhub\modules\matcherChatUi\adapters\ui\Navigation::class, 'topMenu']],
        [\humhub\widgets\NotificationArea::class, \humhub\widgets\NotificationArea::EVENT_RUN,
            [\humhub\modules\matcherChatUi\adapters\ui\Navigation::class, 'notificationArea']],
        [\humhub\modules\user\widgets\AccountProfileMenu::class, \humhub\modules\ui\menu\widgets\Menu::EVENT_RUN,
            [\humhub\modules\matcherChatUi\adapters\ui\Navigation::class, 'accountMenu']],
    ],
];
