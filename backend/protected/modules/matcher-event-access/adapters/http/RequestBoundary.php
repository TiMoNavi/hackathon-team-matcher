<?php
declare(strict_types=1);
namespace humhub\modules\matcherEventAccess\adapters\http;
use yii\web\Request;
final class RequestBoundary
{
    public static function prepare(Request $request): void
    {
        if($request->getMethod()!=='POST'||!preg_match('~^api/v1/(?:events/[1-9][0-9]*/invitation-codes|event-invitations/(?:redeem|inv-[a-f0-9]{32}/revoke))$~D',$request->getPathInfo())
            ||strtolower(trim(explode(';',(string)$request->headers->get('Content-Type'))[0]))!=='application/json')return;
        // Before HumHub LanguageSelector and Yii CSRF parsing; preserve raw JSON for the strict controller.
        $request->setBodyParams([]);
    }
}
