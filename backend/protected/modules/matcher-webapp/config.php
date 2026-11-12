<?php
declare(strict_types=1);

return [
    'id' => 'matcher-webapp',
    'class' => \humhub\modules\matcherWebapp\Module::class,
    'namespace' => 'humhub\modules\matcherWebapp',
    'urlManagerRules' => [
        'matcher/app' => 'matcher-webapp/app/index',
        'matcher/app/<path:[A-Za-z0-9/_-]+>' => 'matcher-webapp/app/index',
    ],
    'events' => [
        [\humhub\modules\user\widgets\AccountProfileMenu::class, \humhub\modules\ui\menu\widgets\Menu::EVENT_RUN,
            [\humhub\modules\matcherWebapp\adapters\ui\Navigation::class, 'accountMenu']],
    ],
];
