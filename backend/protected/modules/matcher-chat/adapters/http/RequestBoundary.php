<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\adapters\http;

final class RequestBoundary
{
    public static function prepare(\yii\web\Request $request): void
    {
        $path = $request->getPathInfo();
        $route = $request->getQueryParam('r');
        $readState = $request->getMethod() === 'PUT' && (preg_match('~^api/v1/conversations/[0-9]+/read-state$~D', $path) || $path === 'matcher-chat/api/read-state' || $route === 'matcher-chat/api/read-state');
        $sendText = $request->getMethod() === 'POST' && (preg_match('~^api/v1/conversations/[0-9]+/messages$~D', $path) || $path === 'matcher-chat/api/messages' || $route === 'matcher-chat/api/messages');
        $group = $request->getMethod() === 'POST' && (preg_match('~^api/v1/(?:conversations/groups|conversations/[0-9]+/(?:invitations|leave)|group-invitations/[0-9]+/(?:accept|decline|withdraw))$~D', $path)
            || preg_match('~^matcher-chat/group/(?:create|invite|accept|decline|withdraw|leave)$~D', $path)
            || (is_string($route) && preg_match('~^matcher-chat/group/(?:create|invite|accept|decline|withdraw|leave)$~D', $route)));
        if (($readState || $sendText || $group) && strtolower(trim(explode(';', (string)$request->headers->get('Content-Type'))[0])) === 'application/json') {
            // Prevent early host form consumers from parsing JSON. Yii still validates CSRF.
            $request->setBodyParams([]);
        }
    }
}
