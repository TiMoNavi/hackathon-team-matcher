<?php
declare(strict_types=1);
return [
    'id' => 'matcher-ideas', 'class' => humhub\modules\matcherIdeas\Module::class, 'namespace' => 'humhub\modules\matcherIdeas', 'strict' => true,
    'events' => [],
    'urlManagerRules' => [
        'api/v1/me/ideas' => 'matcher-ideas/api/me',
        'api/v1/me/ideas/drafts' => 'matcher-ideas/api/drafts',
        'api/v1/me/ideas/drafts/<draftId:\d+>/confirm' => 'matcher-ideas/api/confirm',
        'api/v1/me/ideas/drafts/<draftId:\d+>' => 'matcher-ideas/api/draft',
        'api/v1/ideas/<ideaId:\d+>/activities' => 'matcher-ideas/api/activities',
        'api/v1/ideas/<ideaId:\d+>' => 'matcher-ideas/api/idea',
        'api/v1/idea-activities/<activityId:\d+>/messenger' => 'matcher-ideas/api/messenger',
        'api/v1/idea-activities/<activityId:\d+>' => 'matcher-ideas/api/activity',
    ],
];
