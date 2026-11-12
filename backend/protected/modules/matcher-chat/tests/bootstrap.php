<?php
declare(strict_types=1);

spl_autoload_register(static function (string $class): void {
    $prefix = 'humhub\\modules\\matcherChat\\';
    if (str_starts_with($class, $prefix)) {
        $file = dirname(__DIR__) . '/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
        if (is_file($file)) { require $file; }
    }
});
