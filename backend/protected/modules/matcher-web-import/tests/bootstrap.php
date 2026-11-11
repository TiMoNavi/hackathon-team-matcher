<?php
declare(strict_types=1);
$webModuleRoot = dirname(__DIR__);
spl_autoload_register(static function (string $class) use ($webModuleRoot): void {
    foreach (['humhub\\modules\\matcherWebImport\\' => $webModuleRoot, 'humhub\\modules\\matcherProfile\\' => dirname($webModuleRoot) . '/matcher-user-profile'] as $prefix => $directory) {
        if (str_starts_with($class, $prefix)) { $path = $directory . '/' . str_replace(chr(92), '/', substr($class, strlen($prefix))) . '.php'; if (is_file($path)) { require $path; } }
    }
});
