<?php
declare(strict_types=1);

// Test-only autoload; does not bootstrap HumHub or install/register a module.
$root = dirname(__DIR__, 2);
spl_autoload_register(static function (string $class) use ($root): void {
    $prefix = implode(chr(92), ['humhub', 'modules', 'matcherRecommendation']) . chr(92);
    if (str_starts_with($class, $prefix)) {
        $file = $root . '/' . str_replace(chr(92), '/', substr($class, strlen($prefix))) . '.php';
        if (is_file($file)) { require_once $file; }
    }
});
