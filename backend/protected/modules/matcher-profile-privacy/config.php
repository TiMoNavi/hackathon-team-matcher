<?php
declare(strict_types=1);
use humhub\modules\matcherPrivacy\Module;
use yii\base\Application;

return [
    'id' => 'matcher-profile-privacy',
    'class' => Module::class,
    'namespace' => 'humhub\modules\matcherPrivacy',
    'urlManagerRules' => [
        'api/v1/events/<spaceId:[0-9]+>/profiles/<ownerId:[0-9]+>/overview' => 'matcher-profile-privacy/api/overview',
        'api/v1/events/<spaceId:[0-9]+>/profiles/<ownerId:[0-9]+>/relations' => 'matcher-profile-privacy/api/relations',
        'api/v1/me/profile/presentation' => 'matcher-profile-privacy/api/presentation',
        'api/v1/me/profile/relation-sharing' => 'matcher-profile-privacy/api/relation-sharing',
        'api/v1/me/profile/preview' => 'matcher-profile-privacy/api/preview',
        'api/v1/me/profile/visibility' => 'matcher-profile-privacy/api/visibility',
        'api/v1/me/contacts' => 'matcher-profile-privacy/api/my-contacts',
        'api/v1/profiles/<ownerId:[0-9]+>/contacts' => 'matcher-profile-privacy/api/contacts',
        'api/v1/spaces/<spaceId:[0-9]+>/profiles/<ownerId:[0-9]+>/contacts' => 'matcher-profile-privacy/api/contacts',
    ],
    'events' => [[Application::class, Application::EVENT_BEFORE_REQUEST, [Module::class, 'bootstrapNative']]],
];
