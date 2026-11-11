<?php
declare(strict_types=1);
// Test-only class loading. No application boot, registration, environment or credential reads.
$modules = dirname(__DIR__, 3);
spl_autoload_register(static function (string $class) use ($modules): void {
    foreach (['matcherRecommendation' => 'matcher-recommendation', 'matcherRecommendationAi' => 'matcher-recommendation-ai'] as $namespace => $directory) {
        $prefix = 'humhub\\modules\\' . $namespace . '\\';
        if (str_starts_with($class, $prefix)) {
            $file = $modules . '/' . $directory . '/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
            if (is_file($file)) { require_once $file; }
        }
    }
});
