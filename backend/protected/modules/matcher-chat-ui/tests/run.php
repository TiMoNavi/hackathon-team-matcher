<?php
declare(strict_types=1);

namespace humhub\components {
    // Offline host doubles only; no application, credentials, database or network is booted.
    class Module { public object $settings; public string $basePath; public string $id = 'matcher-chat-ui'; public function getBasePath(): string { return $this->basePath; } }
    class Controller {
        public object $module; public int $parentRuns = 0; public int $parentBeforeActions = 0;
        public function runAction($id, $params = []) {
            $this->parentRuns++;
            if ($id !== '' && $id !== 'index') { throw new \yii\web\NotFoundHttpException('Unknown action.'); }
            if ($this->beforeAction((object) ['id' => 'index'])) { return $this->actionIndex(...$params); }
            return null;
        }
        public function beforeAction($action) { $this->parentBeforeActions++; return true; }
        public function renderPartial(string $view, array $params): string { extract($params); ob_start(); require CHAT_TEST_MODULE_ROOT . '/views/app/' . $view . '.php'; return ob_get_clean(); }
    }
}
namespace yii\base { class Event { public object $sender; } }
namespace yii\helpers { class Url { public static function to(array $route): string { return $route[0]; } } }
namespace yii\web {
    class NotFoundHttpException extends \RuntimeException { public int $statusCode = 404; }
    class MethodNotAllowedHttpException extends \RuntimeException { public int $statusCode = 405; }
}
namespace humhub\modules\ui\menu { class MenuLink { public function __construct(public array $options) {} } }
namespace humhub\modules\ui\menu\widgets { class Menu { public const EVENT_RUN = 'run'; } }
namespace humhub\helpers {
    class Html {
        private static function encode(string $value): string { return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
        public static function a(string $label, string $url): string { return '<a href="' . self::encode($url) . '">' . self::encode($label) . '</a>'; }
        public static function cssFile(string $url): string { return '<link rel="stylesheet" href="' . self::encode($url) . '">'; }
        public static function nonce(): string { return 'nonce="synthetic-nonce"'; }
        public static function script(string $text, array $options): string { return '<script ' . self::nonce() . ' type="' . self::encode($options['type']) . '" src="' . self::encode($options['src']) . '">' . $text . '</script>'; }
    }
}
namespace {
    final class Yii { public static object $app; public static array $warnings = []; public static function warning(string $message, string $category): void { self::$warnings[] = [$message, $category]; } }
    use humhub\modules\matcherChatUi\Module;
    use humhub\modules\matcherChatUi\adapters\assets\Manifest;
    use humhub\modules\matcherChatUi\adapters\ui\Navigation;
    use humhub\modules\matcherChatUi\application\Bootstrap;
    use humhub\modules\matcherChatUi\application\ShellPolicy;
    use humhub\modules\matcherChatUi\controllers\AppController;

    define('CHAT_TEST_MODULE_ROOT', dirname(__DIR__));
    foreach (['application/ShellPolicy.php', 'application/Bootstrap.php', 'application/ReadBootstrap.php', 'adapters/assets/Manifest.php', 'Module.php', 'controllers/AppController.php', 'adapters/ui/Navigation.php'] as $file) { require CHAT_TEST_MODULE_ROOT . '/' . $file; }
    $checks = [];
    function check(string $name, bool $condition): void { global $checks; if (!$condition) { throw new \LogicException($name); } $checks[] = $name; }
    function rejects(string $name, callable $operation, string $expected = \RuntimeException::class): void {
        try { $operation(); } catch (\Throwable $error) {
            if (!$error instanceof $expected) { throw new \LogicException($name . ': unexpected ' . $error::class, 0, $error); }
            check($name, true); return;
        }
        throw new \LogicException($name . ': unexpectedly accepted.');
    }
    $temporary = sys_get_temp_dir() . '/matcher-chat-ui-test-' . bin2hex(random_bytes(8));
    mkdir($temporary, 0700);
    $temporary = realpath($temporary);
    $release = $temporary . '/resources/app';
    mkdir($release . '/assets', 0700, true);
    $original = [
        'index.html' => ['file' => 'assets/main.js', 'isEntry' => true, 'imports' => ['_shared.js'], 'dynamicImports' => ['lazy.tsx'], 'css' => ['assets/main.css'], 'assets' => ['assets/icon.svg']],
        '_shared.js' => ['file' => 'assets/shared.mjs', 'css' => ['assets/shared.css'], 'assets' => ['assets/font.woff2']],
        'lazy.tsx' => ['file' => 'assets/lazy.js', 'css' => ['assets/lazy.css'], 'assets' => ['assets/photo.webp']],
    ];
    foreach (['index.html', 'assets/main.js', 'assets/shared.mjs', 'assets/lazy.js', 'assets/main.css', 'assets/shared.css', 'assets/lazy.css', 'assets/icon.svg', 'assets/font.woff2', 'assets/photo.webp', 'unlisted.php', 'assets/main.js.map'] as $file) { file_put_contents($release . '/' . $file, 'synthetic fixture'); }
    $write = static function (array $data) use ($release): void { file_put_contents($release . '/manifest.json', json_encode($data, JSON_THROW_ON_ERROR)); clearstatcache(); };
    try {
        $write($original);
        $manifest = new Manifest($release); $assets = $manifest->load();
        check('fixed index entry', $assets['entry'] === 'assets/main.js');
        check('dependency CSS order', $assets['css'] === ['assets/shared.css', 'assets/main.css']);
        check('dynamic imports and media validated', in_array('assets/lazy.css', $assets['files'], true) && in_array('assets/photo.webp', $assets['files'], true));
        $filter = $manifest->publishFilter($assets['files']);
        check('publication allows reachable file', $filter($release . '/assets/font.woff2', '/unused'));
        check('publication allows required directory', $filter($release . '/assets', '/unused'));
        foreach (['index.html', 'manifest.json', 'unlisted.php', 'assets/main.js.map'] as $file) { check('publication excludes ' . $file, !$filter($release . '/' . $file, '/unused')); }
        foreach (['../outside.js', '/assets/main.js', 'https://example.invalid/a.js', '//example.invalid/a.js', 'assets\\main.js', 'assets/%2e%2e/main.js', 'assets//main.js', 'assets/./main.js', 'assets/../main.js', 'assets/.hidden.js', 'assets/main.js?x=1', 'assets/main.js#x', 'data:text/javascript,x', 'assets/main.php', str_repeat('a', 241) . '.js', null, 1] as $path) {
            $bad = $original; $bad['index.html']['file'] = $path; $write($bad);
            rejects('invalid entry path ' . count($checks), static fn() => (new Manifest($release))->load());
        }
        foreach (['imports', 'dynamicImports'] as $kind) {
            $bad = $original; $bad['lazy.tsx'][$kind] = ['index.html']; $write($bad); rejects('cycle in ' . $kind, static fn() => (new Manifest($release))->load());
            $bad = $original; $bad['index.html'][$kind] = ['missing.js']; $write($bad); rejects('missing ' . $kind, static fn() => (new Manifest($release))->load());
            $bad = $original; $bad['index.html'][$kind] = 'not a list'; $write($bad); rejects('malformed ' . $kind, static fn() => (new Manifest($release))->load());
            $bad = $original; $bad['index.html'][$kind] = ['https://example.invalid/chunk']; $bad['https://example.invalid/chunk'] = ['file' => 'assets/lazy.js']; $write($bad); rejects('external existing import key ' . $kind, static fn() => (new Manifest($release))->load());
        }
        foreach (['css' => 'css', 'assets' => 'woff2'] as $kind => $extension) {
            $bad = $original; $bad['lazy.tsx'][$kind] = ['https://example.invalid/file.' . $extension]; $write($bad); rejects('external nested ' . $kind, static fn() => (new Manifest($release))->load());
            $bad = $original; $bad['_shared.js'][$kind] = ['assets/missing.' . $extension]; $write($bad); rejects('missing nested ' . $kind, static fn() => (new Manifest($release))->load());
        }
        $bad = $original; $bad['index.html']['isEntry'] = 1; $write($bad); rejects('strict entry boolean', static fn() => (new Manifest($release))->load());
        $bad = $original; unset($bad['index.html']); $write($bad); rejects('missing fixed entry', static fn() => (new Manifest($release))->load());
        $bad = $original; for ($i = 0; $i < 2050; $i++) { $bad['extra' . $i] = []; } $write($bad); rejects('node limit', static fn() => (new Manifest($release))->load());
        $bad = $original; $bad['index.html']['imports'] = ['deep0']; for ($i = 0; $i < 66; $i++) { $bad['deep' . $i] = ['file' => 'assets/lazy.js', 'imports' => $i < 65 ? ['deep' . ($i + 1)] : []]; } $write($bad); rejects('graph depth limit', static fn() => (new Manifest($release))->load());
        file_put_contents($release . '/manifest.json', '{'); rejects('malformed JSON', static fn() => (new Manifest($release))->load());
        file_put_contents($release . '/manifest.json', str_repeat(' ', 1048577)); rejects('manifest byte limit', static fn() => (new Manifest($release))->load());
        $write($original); rename($release . '/index.html', $release . '/index.absent'); rejects('missing build index', static fn() => (new Manifest($release))->load()); rename($release . '/index.absent', $release . '/index.html');
        rename($release . '/assets/main.js', $release . '/assets/original.js'); symlink($release . '/assets/original.js', $release . '/assets/main.js');
        rejects('in-root asset symlink', static fn() => (new Manifest($release))->load()); check('publication excludes symlink', !$filter($release . '/assets/main.js', '/unused'));
        unlink($release . '/assets/main.js'); rename($release . '/assets/original.js', $release . '/assets/main.js');
        symlink($release . '/assets', $release . '/linked'); $bad = $original; $bad['index.html']['file'] = 'linked/main.js'; $write($bad); rejects('directory symlink', static fn() => (new Manifest($release))->load()); unlink($release . '/linked');
        symlink($release, $temporary . '/release-link'); rejects('release symlink', static fn() => new Manifest($temporary . '/release-link')); unlink($temporary . '/release-link');
        rejects('absent release', static fn() => new Manifest($temporary . '/missing'));
        $write($original);

        $csrf = '</script><script>alert("synthetic")</script>&';
        $bootstrap = Bootstrap::data($csrf, '/dashboard/dashboard', '/user/auth/login'); $json = Bootstrap::json($bootstrap);
        check('exact eight bootstrap fields', array_keys($bootstrap) === ['schema_version', 'integration_stage', 'base_path', 'api_base', 'native_home_url', 'native_login_url', 'csrf_header', 'csrf_token']);
        check('shell stage only', $bootstrap['integration_stage'] === 'shell' && $bootstrap['base_path'] === '/matcher/chat');
        check('script closing safely encoded', !str_contains($json, '<') && !str_contains($json, '>') && !str_contains($json, '&'));
        check('CSRF value preserved', json_decode($json, true, 64, JSON_THROW_ON_ERROR)['csrf_token'] === $csrf);
        foreach (['schema_version' => '1', 'integration_stage' => 'connected', 'csrf_token' => [], 'native_home_url' => '//example.invalid'] as $key => $value) { $bad = $bootstrap; $bad[$key] = $value; rejects('bootstrap strict ' . $key, static fn() => Bootstrap::json($bad), \InvalidArgumentException::class); }
        rejects('unexpected bootstrap field', static fn() => Bootstrap::json([...$bootstrap, 'user_id' => 1]), \InvalidArgumentException::class);
        $bad = $bootstrap; unset($bad['csrf_token']); rejects('missing bootstrap field', static fn() => Bootstrap::json($bad), \InvalidArgumentException::class);
        foreach (['https://example.invalid/', '//example.invalid/', '\\example.invalid', '/\\example.invalid', "/unsafe\npath"] as $url) { rejects('unsafe fallback ' . count($checks), static fn() => Bootstrap::data('synthetic', $url, '/user/auth/login'), \InvalidArgumentException::class); }
        foreach (['', 'conversations/1', 'conversations/' . PHP_INT_MAX] as $path) { check('valid local deep link ' . $path, ShellPolicy::allowsPath($path)); }
        foreach (['conversations/0', 'conversations/01', 'conversations/-1', 'conversations/+1', 'conversations/9223372036854775808', 'conversations/' . str_repeat('9', 20), 'conversations/1/', 'conversations/1/2', '../conversations/1', 'conversations/%31', '//example.invalid', 'api/v1/conversations', 'conversations/1?x=1', null, [], 1] as $path) { check('invalid local deep link ' . count($checks), !ShellPolicy::allowsPath($path)); }
        check('local published assets', ShellPolicy::allowsAssetBase('/assets/chat-123'));
        foreach (['https://example.invalid/a', '//example.invalid/a', '/assets/../a', '/assets/%2e/a', '/assets/a?x=1', '/assets/.hidden'] as $url) { check('invalid asset base ' . $url, !ShellPolicy::allowsAssetBase($url)); }

        $module = new Module(); $module->basePath = $temporary;
        $module->settings = new class { public mixed $value = null; public mixed $readValue = null; public function get(string $key): mixed { return match ($key) { 'uiEnabled' => $this->value, 'readUiEnabled' => $this->readValue, default => throw new \LogicException('Unexpected setting.') }; } };
        check('UI default enabled', $module->isUiEnabled());
        foreach ([false, 0, '0', '', 'false', 'unknown', [], 1.0] as $value) { $module->settings->value = $value; check('stored switch fails closed ' . count($checks), !$module->isUiEnabled()); }
        foreach ([true, 1, '1', 'true', null] as $value) { $module->settings->value = $value; check('stored permitted switch ' . count($checks), $module->isUiEnabled()); }
        $module->uiEnabled = false; $module->settings->value = true; check('configuration dominates setting', !$module->isUiEnabled()); $module->uiEnabled = true; $module->settings->value = null;

        Yii::$app = new class {
            public object $request; public object $response; public object $assetManager; public object $user; public ?object $controller = null; public ?object $chatModule = null; public ?object $backendModule = null;
            public function getModule(string $id): ?object { return match ($id) { 'matcher-chat-ui' => $this->chatModule, 'matcher-chat' => $this->backendModule, default => throw new \LogicException('Unexpected module dependency.') }; }
        };
        Yii::$app->chatModule = $module;
        Yii::$app->request = new class($csrf) { public string $method = 'GET'; public string $pathInfo = 'matcher/chat'; public string $baseUrl = ''; public array $queryParams = []; public function __construct(private string $csrf) {} public function getCsrfToken(): string { return $this->csrf; } public function getQueryParam(string $key): mixed { return $this->queryParams[$key] ?? null; } };
        Yii::$app->response = new class { public int $statusCode = 200; public object $headers; public function __construct() { $this->headers = new class { public array $values = []; public function set(string $key, string $value): void { $this->values[$key] = $value; } }; } };
        Yii::$app->assetManager = new class { public bool $linkAssets = false; public string $baseUrl = '/assets/chat-fixture'; public int $publications = 0; public function publish(string $path, array $options): array { $this->publications++; if (!$options['beforeCopy']($path . '/assets/main.js', '/unused')) { throw new \LogicException('Publication filter rejected fixture.'); } return ['/unused', $this->baseUrl]; } };
        Yii::$app->user = (object) ['isGuest' => true];
        $controller = new AppController(); $controller->module = $module; Yii::$app->controller = $controller;
        $html = $controller->runAction('index');
        check('guest shell is data-free and explicitly pending', str_contains($html, '聊天接入中，尚未读取会话。') && !str_contains($html, '没有消息'));
        check('independent root and bootstrap', str_contains($html, 'id="matcher-chat-root"') && str_contains($html, 'id="matcher-chat-bootstrap"'));
        check('view nonce and no script injection', substr_count($html, '<script ') === 2 && substr_count($html, 'nonce="synthetic-nonce"') === 2);
        check('native safe fallbacks and noscript', str_contains($html, '<noscript>') && str_contains($html, '/dashboard/dashboard') && str_contains($html, '/user/auth/login'));
        check('private no-store and nosniff', Yii::$app->response->headers->values['Cache-Control'] === 'private, no-store' && Yii::$app->response->headers->values['X-Content-Type-Options'] === 'nosniff');
        check('parent action filters still called', $controller->parentBeforeActions === 1);
        check('deep link only renders same shell', $controller->runAction('index', ['path' => 'conversations/1']) === $html);
        Yii::$app->request->pathInfo = 'matcher-chat-ui/app/index';
        Yii::$app->request->queryParams = ['returnUrl' => 'https://example.invalid/untrusted', 'next' => '//example.invalid'];
        $beforePublications = Yii::$app->assetManager->publications;
        $redirect = $controller->runAction('index');
        check('native GET redirects to the unique browser entry', $redirect === Yii::$app->response && $redirect->statusCode === 302 && $redirect->headers->values['Location'] === '/matcher/chat');
        check('canonical redirect never loads chat assets', Yii::$app->assetManager->publications === $beforePublications);
        check('native redirect discards untrusted query parameters', !str_contains($redirect->headers->values['Location'], '?') && !str_contains($redirect->headers->values['Location'], 'example.invalid'));
        $controller->runAction('index', ['path' => 'conversations/12']);
        check('native deep link redirects only after validation', Yii::$app->response->headers->values['Location'] === '/matcher/chat/conversations/12');
        Yii::$app->request->pathInfo = '';
        Yii::$app->request->queryParams['r'] = 'matcher-chat-ui/app/index';
        $controller->runAction('index', ['path' => 'conversations/12']);
        check('front controller alias redirects canonically', Yii::$app->response->headers->values['Location'] === '/matcher/chat/conversations/12');
        check('front controller alias publishes no assets', Yii::$app->assetManager->publications === $beforePublications);
        Yii::$app->request->pathInfo = 'matcher-chat-ui/app/index';
        unset(Yii::$app->request->queryParams['r']);
        Yii::$app->request->baseUrl = '/mounted'; $controller->runAction('index', ['path' => 'conversations/12']);
        check('canonical redirect keeps the configured base URL', Yii::$app->response->headers->values['Location'] === '/mounted/matcher/chat/conversations/12');
        foreach (['//example.invalid', 'https://example.invalid', '/mounted/../other'] as $baseUrl) {
            Yii::$app->request->baseUrl = $baseUrl;
            rejects('unsafe redirect base ' . $baseUrl, static fn() => $controller->runAction('index'), \yii\web\NotFoundHttpException::class);
        }
        Yii::$app->request->baseUrl = '';
        foreach (['conversations/0', 'conversations/1/2', [], null] as $path) { rejects('native redirect refuses invalid query path ' . count($checks), static fn() => $controller->runAction('index', ['path' => $path]), \yii\web\NotFoundHttpException::class); }
        foreach (['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE', 'CONNECT'] as $verb) {
            Yii::$app->request->method = $verb; $before = $controller->parentBeforeActions;
            rejects('method ' . $verb . ' rejected before native CSRF', static fn() => $controller->runAction('index'), \yii\web\MethodNotAllowedHttpException::class);
            check('native beforeAction not reached for ' . $verb, $controller->parentBeforeActions === $before);
            check('Allow GET for ' . $verb, Yii::$app->response->headers->values['Allow'] === 'GET');
            $module->uiEnabled = false; rejects('disabled direct route ' . $verb, static fn() => $controller->runAction('index'), \yii\web\NotFoundHttpException::class); $module->uiEnabled = true;
        }
        Yii::$app->request->method = 'GET';
        foreach (['conversations/0', '../mail', [], null] as $path) { rejects('controller invalid path ' . count($checks), static fn() => $controller->runAction('index', ['path' => $path]), \yii\web\NotFoundHttpException::class); }
        $module->uiEnabled = false; rejects('disabled GET direct route', static fn() => $controller->runAction('index'), \yii\web\NotFoundHttpException::class); $module->uiEnabled = true;
        $module->settings->value = 'false'; rejects('stored setting rejects route', static fn() => $controller->runAction('index'), \yii\web\NotFoundHttpException::class); $module->settings->value = null;
        Yii::$app->request->pathInfo = 'matcher/chat'; Yii::$app->request->queryParams = [];
        Yii::$app->response->statusCode = 200;
        rename($release . '/manifest.json', $release . '/manifest.absent'); $before = Yii::$app->assetManager->publications;
        $unavailable = $controller->runAction('index'); check('missing manifest produces safe 503', Yii::$app->response->statusCode === 503 && str_contains($unavailable, '聊天页面暂不可用') && !str_contains($unavailable, '<script'));
        check('missing manifest publishes nothing', Yii::$app->assetManager->publications === $before);
        check('503 preserves safe native links', str_contains($unavailable, '/dashboard/dashboard') && str_contains($unavailable, '/user/auth/login')); rename($release . '/manifest.absent', $release . '/manifest.json');
        Yii::$app->assetManager->linkAssets = true; $controller->runAction('index'); check('linkAssets configuration fails with 503', Yii::$app->response->statusCode === 503); Yii::$app->assetManager->linkAssets = false;
        Yii::$app->assetManager->baseUrl = '//example.invalid/assets'; $controller->runAction('index'); check('external asset publication fails with 503', Yii::$app->response->statusCode === 503); Yii::$app->assetManager->baseUrl = '/assets/chat-fixture';
        check('failure logs are generic', count(array_unique(array_map(static fn(array $warning) => $warning[0], Yii::$warnings))) === 1);

        $readRelease = $temporary . '/resources/read-app'; mkdir($readRelease . '/assets', 0700, true);
        foreach (['index.html', 'manifest.json', 'assets/main.js', 'assets/shared.mjs', 'assets/lazy.js', 'assets/main.css', 'assets/shared.css', 'assets/lazy.css', 'assets/icon.svg', 'assets/font.woff2', 'assets/photo.webp'] as $file) { copy($release . '/' . $file, $readRelease . '/' . $file); }
        check('read UI defaults closed', !$module->isReadUiEnabled());
        $module->readUiEnabled = true;
        foreach ([null, false, 0, '0', '', 'false', [], 1.0] as $value) { $module->settings->readValue = $value; check('read UI stored gate closed ' . count($checks), !$module->isReadUiEnabled()); }
        $module->settings->readValue = true;
        check('read UI requires backend', !$module->isReadUiEnabled());
        Yii::$app->backendModule = new class { public bool $isEnabled = false; public bool $ready = false; public function isReadingEnabled(): bool { return $this->ready; } };
        check('read UI requires enabled backend', !$module->isReadUiEnabled());
        Yii::$app->backendModule->isEnabled = true;
        check('read UI requires reading backend', !$module->isReadUiEnabled());
        Yii::$app->backendModule->ready = true;
        foreach ([true, 1, '1', 'true'] as $value) { $module->settings->readValue = $value; check('read UI explicit setting accepted ' . count($checks), $module->isReadUiEnabled()); }
        Yii::$app->response->statusCode = 200;
        check('guest remains shell with read gate on', str_contains($controller->runAction('index'), '聊天接入中，尚未读取会话。'));
        Yii::$app->user = (object) ['isGuest' => false, 'id' => 23];
        $readHtml = $controller->runAction('index');
        check('native session supplies read actor', str_contains($readHtml, '"actor_id":23') && str_contains($readHtml, '"integration_stage":"read"'));
        check('read host preserves script escaping', !str_contains($readHtml, '<script>alert('));
        rename($readRelease . '/manifest.json', $readRelease . '/manifest.absent');
        $controller->runAction('index'); check('read manifest failure has safe 503', Yii::$app->response->statusCode === 503);
        rename($readRelease . '/manifest.absent', $readRelease . '/manifest.json');
        $module->readUiEnabled = false;
        check('read configuration off returns shell', str_contains($controller->runAction('index'), '聊天接入中，尚未读取会话。'));
        Yii::$app->user->isGuest = true;

        $menu = new class { public array $entries = []; public function addEntry(object $entry): void { $this->entries[] = $entry; } };
        $event = new \yii\base\Event(); $event->sender = $menu; Navigation::accountMenu($event); check('guest has no added navigation', count($menu->entries) === 0);
        Yii::$app->user->isGuest = false; Navigation::accountMenu($event); check('logged-in navigation is local and pending', count($menu->entries) === 1 && $menu->entries[0]->options['label'] === '聊天（接入中）' && $menu->entries[0]->options['url'] === ['/matcher-chat-ui/app/index']);
        $module->uiEnabled = false; Navigation::accountMenu($event); check('disabled module adds no navigation', count($menu->entries) === 1);
        $config = require CHAT_TEST_MODULE_ROOT . '/config.php';
        check('only local page routes registered', array_keys($config['urlManagerRules']) === ['matcher/chat', 'matcher/chat/<path:.*>']);
        $metadata = json_decode(file_get_contents(CHAT_TEST_MODULE_ROOT . '/module.json'), true, 64, JSON_THROW_ON_ERROR);
        check('HumHub-only shell dependency', $metadata['humhub'] === ['minVersion' => '1.19.4']);
        echo json_encode(['status' => 'passed', 'checks' => count($checks), 'scope' => 'offline fixtures, not real HTTP', 'database_access' => false, 'network_access' => false, 'secrets_read' => false], JSON_THROW_ON_ERROR), PHP_EOL;
    } finally {
        $iterator = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($temporary, \FilesystemIterator::SKIP_DOTS), \RecursiveIteratorIterator::CHILD_FIRST);
        foreach ($iterator as $entry) { is_dir($entry->getPathname()) && !is_link($entry->getPathname()) ? rmdir($entry->getPathname()) : unlink($entry->getPathname()); }
        rmdir($temporary);
    }
}
