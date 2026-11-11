<?php
declare(strict_types=1);

use humhub\modules\matcherProfile\Module;
use humhub\modules\matcherProfile\adapters\identity\NativeProfileValidation;
use humhub\modules\user\models\Profile;
use yii\base\Application;
use humhub\modules\matcherProfile\adapters\media\NativeAvatarProjection;
use humhub\modules\content\components\ContentContainerActiveRecord;
use humhub\modules\content\widgets\ContainerProfileHeader;
use humhub\modules\user\models\User;

return [
    'id' => 'matcher-user-profile',
    'class' => Module::class,
    'namespace' => 'humhub\modules\matcherProfile',
    'urlManagerRules' => [
        'api/v1/me' => 'matcher-user-profile/api/me',
        'api/v1/me/profile' => 'matcher-user-profile/api/profile',
        'api/v1/me/profile/drafts' => 'matcher-user-profile/api/drafts',
        'api/v1/me/profile/drafts/<id:[a-f0-9-]+>/confirm' => 'matcher-user-profile/api/confirm',
        'api/v1/me/profile/drafts/<id:[a-f0-9-]+>' => 'matcher-user-profile/api/draft',
        'api/v1/me/profile/reconfirm' => 'matcher-user-profile/api/reconfirm',
        'api/v1/me/profile/revisions/<revision:[0-9]+>' => 'matcher-user-profile/api/revision',
        'api/v1/me/events/<spaceId:[0-9]+>/profile-context' => 'matcher-user-profile/api/context',
        'api/v1/me/spaces/<spaceId:[0-9]+>/profile-context' => 'matcher-user-profile/api/context',
        'api/v1/spaces/<spaceId:[0-9]+>/profiles/<ownerId:[0-9]+>' => 'matcher-user-profile/api/view-profile',
        'api/v1/profiles/<ownerId:[0-9]+>' => 'matcher-user-profile/api/view-profile',
        'api/v1/admin/users/<ownerId:[0-9]+>/profile/proposals' => 'matcher-user-profile/api/proposal',
        'api/v1/me/avatar' => 'matcher-user-profile/api/avatar',
        'api/v1/me/contact-qr' => 'matcher-user-profile/api/contact-qr',
        'api/v1/profile-media/<ref:[a-z0-9_-]+>' => 'matcher-user-profile/api/media',
        // Reserve the independent privacy capability before the generic owner-API fallback.
        'api/v1/me/profile/preview' => 'matcher-profile-privacy/api/preview',
        'api/v1/me/profile/visibility' => 'matcher-profile-privacy/api/visibility',
        'api/v1/me/contacts' => 'matcher-profile-privacy/api/my-contacts',
        // The optional rules workflow owns these HTTP adapters; P1 owns their records.
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
        'api/v1/me/profile/source-capabilities' => 'matcher-user-profile/source/capabilities',
        'api/v1/me/profile/sources' => 'matcher-user-profile/source/sources',
        'api/v1/me/profile/sources/resume' => 'matcher-user-profile/source/resume',
        'api/v1/me/profile/sources/<id:[a-f0-9-]+>/refresh' => 'matcher-user-profile/source/refresh',
        'api/v1/me/profile/sources/<id:[a-f0-9-]+>/progress' => 'matcher-user-profile/source/progress',
        'api/v1/me/profile/sources/<id:[a-f0-9-]+>' => 'matcher-user-profile/source/source',
        'api/v1/me/profile/extractions' => 'matcher-user-profile/source/extractions',
        // Reserve the independent ordinary-discovery endpoints before the owner-API fallback.
        // Module registration prepends rules; these exact reservations work in either load order.
        'api/v1/me/current-event' => 'matcher-recommendation/api/current-event',
        'api/v1/me/events/<spaceId:\d+>/discovery-settings' => 'matcher-recommendation/api/discovery-settings',
        // S7.2 exact owner routes precede the generic P1 fallback in either module load order.
        'api/v1/me/profile/presentation' => 'matcher-profile-privacy/api/presentation',
        'api/v1/me/profile/relation-sharing' => 'matcher-profile-privacy/api/relation-sharing',
        'api/v1/events/<spaceId:[0-9]+>/profiles/<ownerId:[0-9]+>/overview' => 'matcher-profile-privacy/api/overview',
        'api/v1/events/<spaceId:[0-9]+>/profiles/<ownerId:[0-9]+>/relations' => 'matcher-profile-privacy/api/relations',
        'api/v1/me/ideas' => 'matcher-ideas/api/me',
        'api/v1/me/ideas/drafts' => 'matcher-ideas/api/drafts',
        'api/v1/me/ideas/drafts/<draftId:[0-9]+>/confirm' => 'matcher-ideas/api/confirm',
        'api/v1/me/ideas/drafts/<draftId:[0-9]+>' => 'matcher-ideas/api/draft',
        'api/v1/me/<unknown:.*>' => 'matcher-user-profile/api/not-found',
    ],
    'events' => [
        [Application::class, Application::EVENT_BEFORE_REQUEST, [Module::class, 'bootstrapIdentity']],
        [Profile::class, Profile::EVENT_AFTER_VALIDATE, [NativeProfileValidation::class, 'afterValidate']],
        [Profile::class, Profile::EVENT_BEFORE_UPDATE, [\humhub\modules\matcherProfile\adapters\native\NativeEditBridge::class, 'profileBeforeUpdate']],
        [User::class, User::EVENT_BEFORE_UPDATE, [\humhub\modules\matcherProfile\adapters\native\NativeEditBridge::class, 'userBeforeUpdate']],
        [User::class, ContentContainerActiveRecord::EVENT_INIT_PROFILE_IMAGE, [NativeAvatarProjection::class, 'onImage']],
        [ContainerProfileHeader::class, ContainerProfileHeader::EVENT_BEFORE_RUN, [NativeAvatarProjection::class, 'onHeader']],
        [\humhub\modules\user\widgets\AccountProfileMenu::class, \humhub\modules\ui\menu\widgets\Menu::EVENT_RUN, [\humhub\modules\matcherProfile\adapters\ui\EditorNavigation::class, 'accountMenu']],
        [\humhub\modules\user\widgets\ProfileEditButton::class, \yii\base\Widget::EVENT_AFTER_RUN, [\humhub\modules\matcherProfile\adapters\ui\EditorNavigation::class, 'profileButton']],
    ],
];
