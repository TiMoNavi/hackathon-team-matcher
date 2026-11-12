<?php
declare(strict_types=1);
require __DIR__ . '/event_runtime.php';
require __DIR__ . '/auth_runtime.php';
$loader = 'humhub\components\bootstrap\ModuleAutoLoader';
$language = 'humhub\components\bootstrap\LanguageSelector';
$boundary = 'humhub\modules\matcherEventAccess\adapters\http\EventAccessRequestBootstrap';
$passed = 0;
$assert = static function (bool $ok) use (&$passed): void { if (!$ok) { throw new RuntimeException('Bootstrap invariant failed.'); } ++$passed; };
$base = ['before', $loader, 'between', $language, 'after'];
$actual = overnightEventAccessWebBootstrap($base);
$assert($actual === ['before', $loader, 'between', $boundary, $language, 'after']);
$assert(overnightEventAccessWebBootstrap($actual) === $actual);
$combined = overnightEventAccessWebBootstrap(overnightAuthWebBootstrap($base));
$assert(count($combined) === count($base) + 2);
$assert(array_search($boundary, $combined, true) < array_search($language, $combined, true));
foreach ([[], [$language, $loader], [$loader, $language, $language], [$loader, $loader, $language], [$boundary, $loader, $language], [$loader, $language, $boundary], [$loader, $boundary, $boundary, $language]] as $bad) {
    $refused = false;
    try { overnightEventAccessWebBootstrap($bad); } catch (RuntimeException) { $refused = true; }
    $assert($refused);
}
echo json_encode(['status' => 'passed', 'checks' => $passed, 'private_reads' => false, 'database' => false, 'network' => false]), PHP_EOL;
