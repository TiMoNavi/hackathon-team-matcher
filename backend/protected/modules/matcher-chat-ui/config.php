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
        [\humhub\modules\user\widgets\AccountProfileMenu::class, \humhub\modules\ui\menu\widgets\Menu::EVENT_RUN,
            [\humhub\modules\matcherChatUi\adapters\ui\Navigation::class, 'accountMenu']],
    ],
];
