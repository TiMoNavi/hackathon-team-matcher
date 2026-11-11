<?php
declare(strict_types=1);

// Static dependency checks for the pure layers. This is not an application bootstrap.
$root = dirname(__DIR__, 2);
$violations = [];
$files = [];
$own = implode(chr(92), ['humhub', 'modules', 'matcherRecommendation']) . chr(92);
$forbiddenCalls = ['file_get_contents', 'file_put_contents', 'fopen', 'fsockopen', 'pfsockopen', 'stream_socket_client', 'curl_init', 'curl_exec', 'exec', 'shell_exec', 'system', 'passthru', 'proc_open', 'popen'];
$forbiddenNames = ['yii', 'pdo', 'mysqli', 'activerecord'];
foreach (['contracts', 'domain', 'application'] as $layer) {
    $directory = $root . '/' . $layer;
    if (!is_dir($directory)) { throw new RuntimeException('Missing pure layer: ' . $layer); }
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($directory, FilesystemIterator::SKIP_DOTS));
    foreach ($iterator as $file) {
        if (!$file->isFile() || $file->getExtension() !== 'php') { continue; }
        $relative = substr($file->getPathname(), strlen($root) + 1);
        $files[] = $relative;
        $tokens = array_values(array_filter(token_get_all(file_get_contents($file->getPathname())), static fn($token): bool => !is_array($token) || !in_array($token[0], [T_COMMENT, T_DOC_COMMENT, T_WHITESPACE], true)));
        foreach ($tokens as $i => $token) {
            if (!is_array($token)) { continue; }
            [$type, $text, $line] = $token;
            if (in_array($type, [T_REQUIRE, T_REQUIRE_ONCE, T_INCLUDE, T_INCLUDE_ONCE, T_EVAL], true)) {
                $violations[] = $relative . ':' . $line . ' includes external execution';
            }
            if (in_array($type, [T_NAME_QUALIFIED, T_NAME_FULLY_QUALIFIED], true)) {
                $name = ltrim($text, chr(92));
                $allowed = false;
                $allowedAreas = $layer === 'application' ? ['contracts', 'domain', 'application'] : ['contracts', 'domain'];
                foreach ($allowedAreas as $area) {
                    $prefix = $own . $area;
                    if ($name === $prefix || str_starts_with($name, $prefix . chr(92))) { $allowed = true; }
                }
                if (str_contains($name, chr(92)) && !$allowed) { $violations[] = $relative . ':' . $line . ' depends on ' . $name; }
                if (in_array(strtolower($name), $forbiddenNames, true)) { $violations[] = $relative . ':' . $line . ' uses framework/database class'; }
            }
            if ($type === T_STRING && in_array(strtolower($text), $forbiddenNames, true)) { $violations[] = $relative . ':' . $line . ' uses forbidden class'; }
            if ($type === T_STRING && in_array(strtolower($text), $forbiddenCalls, true) && ($tokens[$i + 1] ?? null) === '(') {
                $violations[] = $relative . ':' . $line . ' calls I/O function ' . $text;
            }
        }
    }
}
$module = file_get_contents($root . '/Module.php');
$config = file_get_contents($root . '/config.php');
foreach (['tests/support', 'tests' . chr(92) . 'support', 'FixtureEnvironment', 'matcherRecommendationAi', 'matcher-recommendation-ai'] as $marker) {
    if (str_contains($module . $config, $marker)) {
        $violations[] = 'Native composition imports synthetic adapters or a concrete AI extension';
    }
}
sort($files);
echo json_encode(['status' => $violations === [] ? 'passed' : 'failed', 'scope' => 'Static direct dependencies and I/O calls in pure layers; not a security sandbox.', 'files_checked' => count($files), 'files' => $files, 'violations' => $violations], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
exit($violations === [] ? 0 : 1);
