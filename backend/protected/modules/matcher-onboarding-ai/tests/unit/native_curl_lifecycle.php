<?php
declare(strict_types=1);

namespace humhub\modules\matcherOnboardingAi\adapters\network {
    /** Namespace-local shims exercise the production branch without any network I/O. */
    final class CurlLifecycleFixture
    {
        public static ?\WeakReference $handle = null;
        public static array $options = [];
        public static bool $setoptSuccess = true;
        public static bool $throwOnExec = false;
        public static int $initCalls = 0;
        public static int $execCalls = 0;
    }
    function curl_init(?string $url = null): \CurlHandle|false
    {
        // A real, unconnected native object verifies automatic resource lifetime under PHP 8.5.
        $handle = \curl_init();
        if ($handle !== false) { CurlLifecycleFixture::$handle = \WeakReference::create($handle); CurlLifecycleFixture::$initCalls++; }
        return $handle;
    }
    function curl_setopt_array(\CurlHandle $handle, array $options): bool
    { CurlLifecycleFixture::$options = $options; return CurlLifecycleFixture::$setoptSuccess; }
    function curl_exec(\CurlHandle $handle): bool
    {
        CurlLifecycleFixture::$execCalls++;
        if (CurlLifecycleFixture::$throwOnExec) { throw new \RuntimeException('Synthetic execution failure.'); }
        (CurlLifecycleFixture::$options[CURLOPT_WRITEFUNCTION])($handle, '{"synthetic":true}');
        return true;
    }
    function curl_getinfo(\CurlHandle $handle, ?int $option = null): int { return 200; }
    function curl_errno(\CurlHandle $handle): int { return 0; }
}

namespace humhub\modules\matcherOnboardingAi\tests {
    use humhub\modules\matcherOnboardingAi\adapters\network\CurlChatTransport;
    use humhub\modules\matcherOnboardingAi\adapters\network\CurlLifecycleFixture;
    use humhub\modules\matcherOnboardingAi\domain\GatewayConfig;
    use humhub\modules\matcherOnboardingAi\domain\TransportFailure;

    function nativeCurlLifecycleChecks(): array
    {
        $checks = []; $deprecations = 0; $previousReporting = error_reporting(E_ALL);
        $handler = static function (int $severity, string $message, string $file, int $line) use (&$deprecations): bool {
            if (($severity & (E_DEPRECATED | E_USER_DEPRECATED)) !== 0) { $deprecations++; throw new \ErrorException($message, 0, $severity, $file, $line); }
            return false;
        };
        set_error_handler($handler);
        try {
            $converted = false;
            try { $handler(E_DEPRECATED, 'Synthetic deprecation conversion probe.', __FILE__, __LINE__); }
            catch (\ErrorException $error) { $converted = $error->getSeverity() === E_DEPRECATED; }
            $checks['native_curl_deprecations_become_exceptions'] = $converted;
            $deprecations = 0;
            $config = new GatewayConfig('https://synthetic.invalid/v1', 'gemini-3.8-flash', 'synthetic-only-key');
            $transport = new CurlChatTransport();
            $response = $transport->request($config, ['model' => 'gemini-3.8-flash']);
            $checks['native_curl_success_survives_strict_error_handler'] = $response === ['status' => 200, 'body' => '{"synthetic":true}'];
            $checks['native_curl_success_releases_handle'] = CurlLifecycleFixture::$handle?->get() === null;
            $checks['native_curl_success_without_deprecation'] = $deprecations === 0;
            $checks['native_curl_exactly_one_synthetic_attempt'] = CurlLifecycleFixture::$initCalls === 1 && CurlLifecycleFixture::$execCalls === 1;
            CurlLifecycleFixture::$setoptSuccess = false;
            try { $transport->request($config, []); $checks['native_curl_setup_failure_preserves_code'] = false; }
            catch (TransportFailure $error) { $checks['native_curl_setup_failure_preserves_code'] = $error->errorCode === 'AI_TRANSPORT_UNAVAILABLE'; }
            $checks['native_curl_setup_failure_releases_handle'] = CurlLifecycleFixture::$handle?->get() === null;
            CurlLifecycleFixture::$setoptSuccess = true; CurlLifecycleFixture::$throwOnExec = true;
            try { $transport->request($config, []); $checks['native_curl_exec_failure_preserves_code'] = false; }
            catch (TransportFailure $error) { $checks['native_curl_exec_failure_preserves_code'] = $error->errorCode === 'AI_NETWORK_ERROR'; }
            $checks['native_curl_exec_failure_releases_handle'] = CurlLifecycleFixture::$handle?->get() === null;
            $checks['native_curl_all_cleanup_without_deprecation'] = $deprecations === 0;
        } finally {
            CurlLifecycleFixture::$options = [];
            CurlLifecycleFixture::$setoptSuccess = true; CurlLifecycleFixture::$throwOnExec = false;
            restore_error_handler(); error_reporting($previousReporting);
        }
        return $checks;
    }
}
