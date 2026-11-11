<?php
declare(strict_types=1);
/** Fixed network adapters for a loopback server backed by an isolated S5B database. */
use humhub\modules\matcherWebImport\domain\ports\DnsResolver;
use humhub\modules\matcherWebImport\domain\ports\HttpTransport;
use humhub\modules\matcherWebImport\application\BoundedWebFetcher;
use humhub\modules\matcherWebImport\application\WebSourceReader;
use humhub\modules\matcherWebImport\adapters\parser\NativeWebDocumentParser;

if (getenv('MATCHER_S5B_WEB_FIXTURE') !== '1' || !str_starts_with((string)$app->db->createCommand('SELECT DATABASE()')->queryScalar(), 'humhub_profile_s5b_test_')) {
    throw new RuntimeException('A synthetic web fixture requires an isolated S5B database.');
}
$stateFile = $app->runtimePath . '/web-fixture-state.json';
$dns = new class implements DnsResolver {
    public function resolve(string $host, int $timeoutMs): array {
        if (!in_array($host, ['profile.example.org', 'final.example.org'], true)) { throw new RuntimeException('Unexpected fixture host.'); }
        return ['93.184.216.34'];
    }
};
$transport = new class($stateFile) implements HttpTransport {
    public function __construct(private string $path) {}
    public function get(string $url, string $ip, int $timeoutMs, int $maxBytes): array {
        if ($ip !== '93.184.216.34' || $timeoutMs < 1 || $maxBytes < 1) { throw new RuntimeException('Fixture pin or budget is invalid.'); }
        $path = parse_url($url, PHP_URL_PATH);
        $state = is_file($this->path) ? json_decode(file_get_contents($this->path), true, 16, JSON_THROW_ON_ERROR) : ['requests' => 0, 'paths' => []];
        ++$state['requests']; $state['paths'][$path] = ($state['paths'][$path] ?? 0) + 1;
        file_put_contents($this->path, json_encode($state, JSON_THROW_ON_ERROR), LOCK_EX);
        if ($path === '/start') { return ['status' => 302, 'headers' => ['location' => 'https://final.example.org/landing'], 'body' => '']; }
        if ($path === '/transient' && $state['paths'][$path] === 1) { return ['status' => 503, 'headers' => [], 'body' => 'synthetic unavailable']; }
        if ($path === '/internal-redirect') { return ['status' => 302, 'headers' => ['location' => 'http://127.0.0.1/private'], 'body' => '']; }
        if (!in_array($path, ['/landing', '/transient'], true)) { throw new RuntimeException('Unexpected fixture path.'); }
        return ['status' => 200, 'headers' => ['content-type' => 'text/html; charset=utf-8'], 'body' => '<!doctype html><html><head><title>S5B Synthetic Profile</title><style>ROOT-S5B-STYLE</style></head><body><main><p>姓名：S5B 合成用户</p><p>城市：杭州</p><p>自我介绍：只提取本人明确填写的字段</p><p>技能：Python、TypeScript</p><p>ROOT-S5B-PRIVATE-SOURCE-ONLY</p></main><script>ROOT-S5B-SCRIPT</script></body></html>'];
    }
};
$app->getModule('matcher-web-import')->setSourceReader('web', new WebSourceReader(new BoundedWebFetcher($dns, $transport), new NativeWebDocumentParser(), null, static fn(): bool => true));
if ($path === '/__s5b_test/web-state') {
    $app->response->format = yii\web\Response::FORMAT_JSON;
    $app->response->data = is_file($stateFile) ? json_decode(file_get_contents($stateFile), true, 16, JSON_THROW_ON_ERROR) : ['requests' => 0, 'paths' => []];
    $app->response->send();
    exit;
}
