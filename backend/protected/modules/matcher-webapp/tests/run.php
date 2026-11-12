<?php
declare(strict_types=1);
namespace humhub\components {
    // Isolated module wiring fixture: no Yii application, database or session is booted.
    class Module { public object $settings; }
    class Controller { public $access = 'humhub\components\access\StrictAccess'; }
}
namespace {
    use humhub\modules\matcherWebapp\adapters\assets\Manifest;
    use humhub\modules\matcherWebapp\application\Bootstrap;
    use humhub\modules\matcherWebapp\application\ShellPolicy;

    $moduleRoot = dirname(__DIR__);
    foreach (['adapters/assets/Manifest.php', 'application/Bootstrap.php', 'application/ShellPolicy.php', 'Module.php', 'controllers/AppController.php'] as $file) {
        require $moduleRoot . '/' . $file;
    }
    $checks = [];
    function check(string $name, bool $condition): void {
        global $checks;
        if (!$condition) { throw new \LogicException($name); }
        $checks[] = $name;
    }
    function rejects(string $name, callable $operation): void {
        try { $operation(); }
        catch (\RuntimeException | \InvalidArgumentException $expected) { check($name, true); return; }
        throw new \LogicException($name . ' was accepted.');
    }
    $temporary = sys_get_temp_dir() . '/matcher-webapp-test-' . bin2hex(random_bytes(10));
    mkdir($temporary, 0700);
    mkdir($temporary . '/assets', 0700);
    $original = [
        'index.html' => ['file' => 'assets/main.js', 'isEntry' => true, 'imports' => ['_shared.js'], 'dynamicImports' => ['lazy.tsx'], 'css' => ['assets/main.css'], 'assets' => ['assets/icon.svg']],
        '_shared.js' => ['file' => 'assets/shared.js', 'css' => ['assets/shared.css'], 'assets' => ['assets/font.woff2']],
        'lazy.tsx' => ['file' => 'assets/lazy.js', 'css' => ['assets/lazy.css'], 'assets' => ['assets/photo.webp']],
    ];
    foreach (['index.html', 'assets/main.js', 'assets/shared.js', 'assets/lazy.js', 'assets/main.css', 'assets/shared.css', 'assets/lazy.css', 'assets/icon.svg', 'assets/font.woff2', 'assets/photo.webp', 'unlisted.php'] as $file) {
        file_put_contents($temporary . '/' . $file, 'synthetic fixture');
    }
    $write = static function (array $data) use ($temporary): void { file_put_contents($temporary . '/manifest.json', json_encode($data, JSON_THROW_ON_ERROR)); };
    try {
        $write($original);
        $manifest = new Manifest($temporary);
        $result = $manifest->load();
        check('fixed entry loaded', $result['entry'] === 'assets/main.js');
        check('static CSS dependency order', $result['css'] === ['assets/shared.css', 'assets/main.css']);
        check('dynamic assets recursively validated and published', in_array('assets/photo.webp', $result['files'], true) && in_array('assets/lazy.css', $result['files'], true));
        $filter = $manifest->publishFilter($result['files']);
        check('publish keeps approved asset', $filter($temporary . '/assets/font.woff2', '/unused') === true);
        check('publish keeps required directory', $filter($temporary . '/assets', '/unused') === true);
        check('publish excludes raw index', $filter($temporary . '/index.html', '/unused') === false);
        check('publish excludes manifest', $filter($temporary . '/manifest.json', '/unused') === false);
        check('publish excludes unrelated source', $filter($temporary . '/unlisted.php', '/unused') === false);
        foreach (['../outside.js', '/assets/main.js', 'https://example.invalid/main.js', '//example.invalid/main.js', 'assets\\main.js', 'assets/%2e%2e/main.js', 'assets//main.js', 'assets/./main.js', 'assets/../main.js', 'assets/.hidden.js', 'assets/main.js?x=1', 'assets/main.js#fragment', 'data:text/javascript,x', 'assets/main.php'] as $file) {
            $bad = $original; $bad['index.html']['file'] = $file; $write($bad);
            rejects('reject entry path ' . $file, static fn() => (new Manifest($temporary))->load());
        }
        foreach (['imports', 'dynamicImports'] as $kind) {
            $bad = $original; $bad['lazy.tsx'][$kind] = ['index.html']; $write($bad);
            rejects('reject recursive ' . $kind . ' cycle', static fn() => (new Manifest($temporary))->load());
            $bad = $original; $bad['index.html'][$kind] = ['missing.js']; $write($bad);
            rejects('reject missing ' . $kind, static fn() => (new Manifest($temporary))->load());
            $bad = $original; $bad['index.html'][$kind] = 'not a list'; $write($bad);
            rejects('reject malformed ' . $kind, static fn() => (new Manifest($temporary))->load());
            $bad = $original; $bad['index.html'][$kind] = ['https://example.invalid/chunk']; $bad['https://example.invalid/chunk'] = ['file' => 'assets/lazy.js']; $write($bad);
            rejects('reject external-looking ' . $kind . ' key even if present', static fn() => (new Manifest($temporary))->load());
        }
        foreach (['css', 'assets'] as $kind) {
            $bad = $original; $bad['lazy.tsx'][$kind] = ['https://example.invalid/file.' . ($kind === 'css' ? 'css' : 'woff2')]; $write($bad);
            rejects('reject external dynamic ' . $kind, static fn() => (new Manifest($temporary))->load());
            $bad = $original; $bad['_shared.js'][$kind] = ['assets/missing.' . ($kind === 'css' ? 'css' : 'woff2')]; $write($bad);
            rejects('reject missing nested ' . $kind, static fn() => (new Manifest($temporary))->load());
        }
        $bad = $original; $bad['index.html']['isEntry'] = false; $write($bad);
        rejects('reject non-entry index', static fn() => (new Manifest($temporary))->load());
        $bad = $original; unset($bad['index.html']); $write($bad);
        rejects('reject missing fixed index manifest entry', static fn() => (new Manifest($temporary))->load());
        $write($original); rename($temporary . '/index.html', $temporary . '/index.absent');
        rejects('reject absent fixed index file', static fn() => (new Manifest($temporary))->load());
        rename($temporary . '/index.absent', $temporary . '/index.html');
        file_put_contents($temporary . '/manifest.json', '{');
        rejects('reject malformed JSON', static fn() => (new Manifest($temporary))->load());
        file_put_contents($temporary . '/manifest.json', str_repeat(' ', 1048577));
        clearstatcache();
        rejects('reject oversized manifest', static fn() => (new Manifest($temporary))->load());
        $write($original); clearstatcache();
        rename($temporary . '/assets/main.js', $temporary . '/assets/original.js');
        symlink($temporary . '/assets/original.js', $temporary . '/assets/main.js');
        rejects('reject asset symlink even within release', static fn() => (new Manifest($temporary))->load());
        check('publish rejects symlink', $filter($temporary . '/assets/main.js', '/unused') === false);
        unlink($temporary . '/assets/main.js'); rename($temporary . '/assets/original.js', $temporary . '/assets/main.js');
        symlink($temporary . '/assets', $temporary . '/linked');
        $bad = $original; $bad['index.html']['file'] = 'linked/main.js'; $write($bad);
        rejects('reject symlink directory', static fn() => (new Manifest($temporary))->load());
        unlink($temporary . '/linked');
        $write($original);

        $bootstrap = Bootstrap::data('</script><script>alert("synthetic")</script>&', '/dashboard/dashboard', '/user/auth/login');
        $json = Bootstrap::json($bootstrap);
        check('bootstrap has only seven permitted fields', count($bootstrap) === 7 && array_keys($bootstrap) === ['schema_version', 'base_path', 'api_base', 'native_home_url', 'native_login_url', 'csrf_header', 'csrf_token']);
        check('bootstrap has no identity, model or profile copy', !preg_match('/user_id|profile|space_id|access_token|client_secret|api_key|source_text/', $json));
        check('bootstrap prevents script close and HTML injection', !str_contains($json, '<') && !str_contains($json, '>') && !str_contains($json, '&'));
        check('bootstrap encoding preserves the CSRF value', json_decode($json, true, 64, JSON_THROW_ON_ERROR)['csrf_token'] === $bootstrap['csrf_token']);
        rejects('bootstrap rejects additional secret field', static fn() => Bootstrap::json([...$bootstrap, 'api_key' => 'synthetic']));
        foreach (['https://example.invalid/', '//example.invalid/', "\\example.invalid", "/\\example.invalid", "/unsafe\npath"] as $url) {
            rejects('bootstrap rejects unsafe fallback', static fn() => Bootstrap::data('csrf', $url, '/user/auth/login'));
        }
        foreach (['', 'discover', 'onboarding/materials', 'messages/12', 'ideas/draft_1', 'events/1'] as $path) { check('allow local app route ' . $path, ShellPolicy::allowsPath($path)); }
        foreach (['user/list', 'api/v1/me', '../profile', '//example.invalid', 'discover/../people', 'discover/%2e%2e', 'profile?returnUrl=x', 'messages/1/2/3/4/5', 'discover/' . str_repeat('a', 65)] as $path) { check('reject non-app route ' . $path, !ShellPolicy::allowsPath($path)); }
        check('assets accept local publication base', ShellPolicy::allowsAssetBase('/assets/abc-012'));
        foreach (['https://cdn.example.invalid/assets/a', '//cdn.example.invalid/a', '/assets/../secret', '/assets/%2e%2e/secret', '/assets/a?redirect=x'] as $url) { check('assets reject external or ambiguous base', !ShellPolicy::allowsAssetBase($url)); }
        $pageController = new \humhub\modules\matcherWebapp\controllers\AppController();
        check('public empty shell overrides native StrictAccess only for this controller', $pageController->access === 'humhub\components\access\ControllerAccess');
        $module = new \humhub\modules\matcherWebapp\Module();
        $module->settings = new class {
            public mixed $value = null;
            public function get(string $name): mixed { if ($name !== 'uiEnabled') { throw new \LogicException('Unexpected setting.'); } return $this->value; }
        };
        check('UI defaults on without stored override', $module->isUiEnabled());
        foreach ([false, 0, '0', '', 'false', 'unknown'] as $value) { $module->settings->value = $value; check('stored disabled value fails closed', !$module->isUiEnabled()); }
        foreach ([true, 1, '1', 'true'] as $value) { $module->settings->value = $value; check('stored enabled value accepted', $module->isUiEnabled()); }
        $module->uiEnabled = false;
        check('configuration off cannot be overridden by settings', !$module->isUiEnabled());
        $view = file_get_contents($moduleRoot . '/views/app/index.php');
        check('view uses host nonce and module script', str_contains($view, 'Html::nonce()') && str_contains($view, "'type' => 'module'") && str_contains($view, 'Bootstrap::json($bootstrap)'));
        $controller = file_get_contents($moduleRoot . '/controllers/AppController.php');
        check('switch and path fail with 404', str_contains($controller, '!$this->module->isUiEnabled()') && str_contains($controller, 'throw new NotFoundHttpException'));
        check('shell keeps native CSRF protection', !str_contains($controller, 'enableCsrfValidation') && str_contains($controller, 'getCsrfToken()'));
        echo json_encode(['status' => 'passed', 'checks' => count($checks), 'database_access' => false, 'network_access' => false, 'secrets_read' => false], JSON_THROW_ON_ERROR), PHP_EOL;
    } finally {
        $iterator = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($temporary, \FilesystemIterator::SKIP_DOTS), \RecursiveIteratorIterator::CHILD_FIRST);
        foreach ($iterator as $file) { is_dir($file->getPathname()) && !is_link($file->getPathname()) ? rmdir($file->getPathname()) : unlink($file->getPathname()); }
        rmdir($temporary);
    }
}
