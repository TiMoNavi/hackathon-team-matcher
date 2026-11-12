<?php
declare(strict_types=1);
namespace humhub\modules\matcherAuth\adapters\http;

final class RedactedHttpClient extends \yii\httpclient\Client
{
    public function createRequestLogToken($method, $url, $headers, $content) { return 'matcher-auth GitHub HTTP request [redacted]'; }
}
