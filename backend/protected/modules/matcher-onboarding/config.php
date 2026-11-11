<?php
declare(strict_types=1);

return [
    'id' => 'matcher-onboarding',
    'class' => \humhub\modules\matcherOnboarding\Module::class,
    'namespace' => 'humhub\modules\matcherOnboarding',
    'urlManagerRules' => [
        'api/v1/onboarding/sessions' => 'matcher-onboarding/api/sessions',
        'api/v1/onboarding/sessions/<id:[a-f0-9-]+>/progress' => 'matcher-onboarding/api/session-progress',
        'api/v1/onboarding/sessions/<id:[a-f0-9-]+>' => 'matcher-onboarding/api/session',
        'api/v1/me/profile/ai-capabilities' => 'matcher-onboarding/api/ai-capabilities',
        'api/v1/me/profile/ai-jobs/<id:[a-f0-9-]+>/progress' => 'matcher-onboarding/api/ai-job-progress',
        'api/v1/me/profile/ai-jobs/<id:[a-f0-9-]+>/cancel' => 'matcher-onboarding/api/ai-cancel',
        'api/v1/me/profile/ai-jobs/<id:[a-f0-9-]+>/retry' => 'matcher-onboarding/api/ai-retry',
        'api/v1/me/profile/ai-jobs/<id:[a-f0-9-]+>/apply' => 'matcher-onboarding/api/ai-apply',
        'api/v1/me/profile/ai-jobs/<id:[a-f0-9-]+>' => 'matcher-onboarding/api/ai-job',
        'api/v1/me/profile/question-batches' => 'matcher-onboarding/api/question-batches',
        'api/v1/me/profile/question-batches/<batchId:[a-f0-9-]+>/answers/<questionId:[A-Za-z0-9_.:-]+>' => 'matcher-onboarding/api/answer',
        'api/v1/me/profile/question-batches/<batchId:[a-f0-9-]+>' => 'matcher-onboarding/api/question-batch',
        'api/v1/me/profile/syntheses' => 'matcher-onboarding/api/syntheses',
    ],
    'events' => [
        [\humhub\modules\user\widgets\AccountProfileMenu::class, \humhub\modules\ui\menu\widgets\Menu::EVENT_RUN, [\humhub\modules\matcherOnboarding\adapters\ui\FlowNavigation::class, 'accountMenu']],
    ],
];
