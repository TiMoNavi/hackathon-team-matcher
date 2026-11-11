<?php
declare(strict_types=1);
// Child process for the temporary synthetic database created by run.php.
require dirname(__DIR__) . '/support/autoload.php';
use humhub\modules\matcherRecommendation\adapters\conversation\PdoConversationStore;
if ($argc !== 3 || !is_file($argv[1]) || !str_starts_with(basename($argv[1]), 'matcher-conversation-') || !in_array($argv[2], ['A', 'B'], true)) { exit(2); }
$db = new PDO('sqlite:' . $argv[1]);
$db->exec('PRAGMA busy_timeout = 2000');
$store = new PdoConversationStore($db);
$before = $store->load('race', 1);
if (($before['version'] ?? null) !== 1) { exit(3); }
echo 'ready:', $before['version'], PHP_EOL;
fflush(STDOUT);
if (trim((string)fgets(STDIN)) !== 'go') { exit(4); }
$won = $store->compareAndSwap('race', 1, $before['version'], ['version' => 2, 'writer' => $argv[2]]);
echo json_encode(['won' => $won, 'writer' => $argv[2]], JSON_THROW_ON_ERROR), PHP_EOL;
