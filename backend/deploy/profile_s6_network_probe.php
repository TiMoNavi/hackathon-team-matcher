<?php
declare(strict_types=1);
/** Root-only synthetic failed-job diagnostic; emits transport metadata, never request/response bodies. */
if (PHP_SAPI !== 'cli' || getenv('MATCHER_S6_LIVE_GATEWAY') !== '1') { exit(2); }
$target = $argv[1] ?? '';
if (!preg_match('/^humhub_profile_s6_test_root_[a-f0-9]{8}$/D', $target)) { exit(2); }
putenv('MATCHER_S6_TEST_DB=' . $target);
$app = require dirname(__DIR__) . '/protected/modules/matcher-onboarding/tests/integration/s6_http_bootstrap.php';
$fixture = json_decode(file_get_contents($app->runtimePath . '/live-fixture.json'), true, 8, JSON_THROW_ON_ERROR);
$owner = (int)$fixture['users']['owner'];
$user = humhub\modules\user\models\User::findOne($owner);
if (!$user || !str_starts_with($user->username, 's6_owner_')) { exit(2); }
$id = (new yii\db\Query())->select('id')->from('{{%matcher_profile_ai_job}}')->where(['owner_id' => $owner, 'execution_status' => 'failed', 'applicability' => 'current'])->orderBy(['created_at' => SORT_DESC])->scalar($app->db);
if (!$id) { throw new RuntimeException('No synthetic failed job was found.'); }
$probe = [];
$transport = new humhub\modules\matcherOnboardingAi\adapters\network\CurlChatTransport(static function (string $url, array $options) use (&$probe): array {
    $body = ''; $original = $options[CURLOPT_WRITEFUNCTION];
    $options[CURLOPT_WRITEFUNCTION] = static function ($handle, string $chunk) use (&$body, $original): int {
        $length = $original($handle, $chunk); if ($length > 0) { $body .= $chunk; } return $length;
    };
    $handle = curl_init($url); curl_setopt_array($handle, $options); curl_exec($handle);
    $info = curl_getinfo($handle); $errno = curl_errno($handle);
    $probe = ['request_bytes' => strlen($options[CURLOPT_POSTFIELDS]), 'response_bytes' => strlen($body), 'http_status' => $info['http_code'], 'curl_errno' => $errno, 'curl_error_category' => curl_strerror($errno), 'curl_diagnostic' => mb_substr(preg_replace('/sk-[A-Za-z0-9]+/', '[redacted]', curl_error($handle)), 0, 180), 'http_version' => $info['http_version'], 'elapsed_ms' => (int)round($info['total_time'] * 1000), 'connect_ms' => (int)round($info['connect_time'] * 1000), 'start_transfer_ms' => (int)round($info['starttransfer_time'] * 1000), 'tls_verified' => $info['ssl_verify_result'] === 0];
    unset($handle); return ['status' => (int)$info['http_code'], 'body' => $body, 'errno' => $errno];
});
$module = $app->getModule('matcher-onboarding-ai');
$config = (new humhub\modules\matcherOnboardingAi\adapters\config\PrivateConfigLoader())->load($module->configPath);
$module->setAiEngine(new humhub\modules\matcherOnboardingAi\application\StructuredProfileAiEngine($config, $transport));
$service = $app->getModule('matcher-onboarding')->getAiJobService();
$retry = $service->retry($owner, $id, 'root-diagnostic-' . bin2hex(random_bytes(8)));
$job = $service->work($retry['job_id']);
$report = ['job_id' => $job['job_id'], 'attempt' => $job['attempt'], 'status' => $job['execution_status'], 'error_code' => $job['error_code'], 'metrics' => $job['metrics'], 'network' => $probe, 'synthetic_only' => true, 'profile_confirmed' => false];
file_put_contents($app->runtimePath . '/gateway-diagnostic.json', json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR), PHP_EOL;
