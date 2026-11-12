<?php
declare(strict_types=1);
namespace humhub\modules\matcherAuth\adapters\http;

final class GithubCurlTransport extends \yii\httpclient\CurlTransport
{
    public function send($request)
    {
        $url = parse_url($request->getFullUrl());
        if (!is_array($url) || ($url['scheme'] ?? null) !== 'https' || isset($url['user']) || isset($url['pass']) || isset($url['fragment'])
            || (isset($url['port']) && $url['port'] !== 443)
            || !(($url['host'] ?? '') === 'github.com' && ($url['path'] ?? '') === '/login/oauth/access_token'
                || ($url['host'] ?? '') === 'api.github.com' && in_array($url['path'] ?? '', ['/user', '/user/emails'], true))) {
            throw new \RuntimeException('GitHub authentication transport target refused.');
        }
        $request->setOptions(array_replace($request->getOptions(), [
            CURLOPT_FOLLOWLOCATION => false, CURLOPT_MAXREDIRS => 0, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_TIMEOUT => 30, CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
        ]));
        $response = parent::send($request);
        if ($response->getStatusCode() >= 300 && $response->getStatusCode() < 400) { throw new \RuntimeException('GitHub authentication redirect refused.'); }
        return $response;
    }
}
