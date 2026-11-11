<?php
declare(strict_types=1);
// Spawned only by run.php against its freshly-created synthetic SQLite file.
require dirname(__DIR__) . '/support/autoload.php';
use humhub\modules\matcherRecommendation\adapters\conversation\PdoConversationStore;
if ($argc !== 2 || !is_file($argv[1]) || !str_starts_with(basename($argv[1]), 'matcher-conversation-')) { exit(2); }
$store = new PdoConversationStore(new PDO('sqlite:' . $argv[1]));
$snapshot = $store->load('persistent', 1);
echo json_encode(['version' => $snapshot['version'] ?? null, 'owner_isolated' => $store->load('persistent', 2) === null, 'calls' => $snapshot['calls'] ?? null], JSON_THROW_ON_ERROR), PHP_EOL;
