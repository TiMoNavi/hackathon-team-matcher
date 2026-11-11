<?php
declare(strict_types=1);
// No application, credentials, .env, external service or production DB is loaded.
spl_autoload_register(static function (string $class): void {
    $prefix = 'humhub\\modules\\matcherIdeas\\';
    if (str_starts_with($class, $prefix)) {
        $path = dirname(__DIR__) . '/' . str_replace(chr(92), '/', substr($class, strlen($prefix))) . '.php';
        if (is_file($path)) { require_once $path; }
    }
});
$checks = [];
function check(bool $condition, string $name): void
{ global $checks; if (!$condition) { throw new RuntimeException('FAILED: ' . $name); } $checks[] = $name; }
function rejects(callable $action, string $code): void
{
    try { $action(); } catch (humhub\modules\matcherIdeas\domain\IdeaException $error) { check($error->errorCode === $code, $code); return; }
    throw new RuntimeException('Expected ' . $code);
}
