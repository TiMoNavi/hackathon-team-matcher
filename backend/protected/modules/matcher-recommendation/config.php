<?php
declare(strict_types=1);

use humhub\modules\matcherRecommendation\Module;

// Session-authenticated discovery and a default-disabled, plugin-specific synchronous conversation extension.
return [
    'id' => 'matcher-recommendation',
    'class' => Module::class,
    'namespace' => 'humhub\modules\matcherRecommendation',
    'strict' => true,
    'events' => [],
    'urlManagerRules' => [
        'api/v1/events/<spaceId:\d+>/recommendation-analysis/self-selection' => 'matcher-recommendation/analysis/self-selection',
        'api/v1/events/<spaceId:\d+>/recommendation-analysis/people/<ownerId:\d+>' => 'matcher-recommendation/analysis/person',
        'api/v1/events/<spaceId:\d+>/recommendation-conversations' => 'matcher-recommendation/conversation/create',
        'api/v1/recommendation-conversations/<id:conversation-[a-f0-9]{32}(?:[a-f0-9]{32})?>/requirements/confirm' => 'matcher-recommendation/conversation/confirm',
        'api/v1/recommendation-conversations/<id:conversation-[a-f0-9]{32}(?:[a-f0-9]{32})?>/turns' => 'matcher-recommendation/conversation/turn',
        'api/v1/recommendation-conversations/<id:conversation-[a-f0-9]{32}(?:[a-f0-9]{32})?>' => 'matcher-recommendation/conversation/read',
        'api/v1/me/current-event' => 'matcher-recommendation/api/current-event',
        'api/v1/me/events/<spaceId:\d+>/discovery-settings' => 'matcher-recommendation/api/discovery-settings',
        'api/v1/events/<spaceId:\d+>/discovery/people/<ownerId:\d+>' => 'matcher-recommendation/api/person',
        'api/v1/events/<spaceId:\d+>/discovery' => 'matcher-recommendation/api/discovery',
    ],
];
