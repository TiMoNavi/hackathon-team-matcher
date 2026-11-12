<?php
declare(strict_types=1);
namespace humhub\modules\matcherAuth\adapters\http;

use yii\web\Request;

final class RequestBoundary
{
    public static function prepare(Request $request): void
    {
        if ($request->getMethod() !== 'POST'
            || !in_array($request->getPathInfo(), ['api/v1/auth/email-codes', 'api/v1/auth/email/verify', 'api/v1/auth/logout'], true)
            || strtolower(trim(explode(';', (string)$request->headers->get('Content-Type'))[0])) !== 'application/json') { return; }
        // Leave rawBody untouched. ApiController validates its size, JSON object, field allowlist,
        // and Yii still validates the X-CSRF-Token header. No native form or global parser changes.
        $request->setBodyParams([]);
    }
}
