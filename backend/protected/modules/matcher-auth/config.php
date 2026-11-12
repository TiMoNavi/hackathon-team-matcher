<?php
declare(strict_types=1);
return [
    'id' => 'matcher-auth',
    'class' => \humhub\modules\matcherAuth\Module::class,
    'namespace' => 'humhub\modules\matcherAuth',
    'urlManagerRules' => [
        'api/v1/auth/capabilities' => 'matcher-auth/api/capabilities',
        'api/v1/auth/email-codes' => 'matcher-auth/api/email-codes',
        'api/v1/auth/email/verify' => 'matcher-auth/api/verify',
        'api/v1/auth/logout' => 'matcher-auth/api/logout',
        'api/v1/auth/github/start' => 'matcher-auth/api/github-start',
        'api/v1/auth/github/import-status' => 'matcher-auth/github-import-status/index',
    ],
    'events' => [[\humhub\components\Application::class, \humhub\components\Application::EVENT_BEFORE_REQUEST,
        [\humhub\modules\matcherAuth\Events::class, 'beforeRequest']]],
];
