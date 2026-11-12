<?php
declare(strict_types=1);
return [
    'id'=>'matcher-event-access','class'=>\humhub\modules\matcherEventAccess\Module::class,'namespace'=>'humhub\\modules\\matcherEventAccess',
    'urlManagerRules'=>[
        'api/v1/me/events'=>'matcher-event-access/api/joined',
        'api/v1/events/<spaceId:[1-9][0-9]*>/invitation-codes'=>'matcher-event-access/api/create',
        'api/v1/event-invitations/redeem'=>'matcher-event-access/api/redeem',
        'api/v1/event-invitations/<id:inv-[a-f0-9]{32}>/revoke'=>'matcher-event-access/api/revoke',
        'api/v1/event-invitation-receipts/<id:receipt-[a-f0-9]{32}>'=>'matcher-event-access/api/receipt',
    ],
];
