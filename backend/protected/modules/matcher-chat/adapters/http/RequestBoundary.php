<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\adapters\http;

final class RequestBoundary
{
    public static function prepare(\yii\web\Request $request): void
    {
        $path = $request->getPathInfo();
        $route = $request->getQueryParam('r');
        if ($request->getMethod() === 'PUT' && (preg_match('~^api/v1/conversations/[0-9]+/read-state$~D', $path) || $path === 'matcher-chat/api/read-state' || $route === 'matcher-chat/api/read-state') && strtolower(trim(explode(';', (string)$request->headers->get('Content-Type'))[0])) === 'application/json') {
            // Prevent early host form consumers from parsing JSON. Yii still validates CSRF.
            $request->setBodyParams([]);
        }
    }
}
