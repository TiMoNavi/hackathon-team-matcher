<?php
declare(strict_types=1);
require dirname(__DIR__, 4) . '/vendor/autoload.php';
require dirname(__DIR__, 4) . '/vendor/yiisoft/yii2/Yii.php';
require __DIR__ . '/QueryProbe.php';
use S73Performance\{QueryProbe, ProbeCommand};

$checks = [];
function verify(bool $condition, string $message): void { global $checks; if (!$condition) { throw new RuntimeException($message); } $checks[] = $message; }
$db = new yii\db\Connection(['dsn' => 'sqlite::memory:', 'commandClass' => ProbeCommand::class, 'enableLogging' => false, 'enableProfiling' => false]);
$db->open();
$probe = new QueryProbe(); $probe->begin();
$secret = 's73-test-never-export-this-profile-value';
$actual = $db->createCommand('SELECT :value AS label', [':value' => $secret])->queryAll();
verify($actual === [['label' => $secret]], 'instrumentation preserves actual returned data');
$db->createCommand('SELECT 1')->queryScalar();
$measurement = $probe->end();
verify($measurement['query_count'] === 2 && $measurement['returned_rows'] === 1, 'counts executed reads and returned fetchAll rows');
verify($measurement['query_elapsed_ms'] >= 0 && $measurement['groups']['other']['failures'] === 0, 'records successful elapsed query measurements');
$serialized = json_encode($measurement, JSON_THROW_ON_ERROR);
verify(!str_contains($serialized, $secret) && !str_contains($serialized, ':value') && !str_contains($serialized, 'SELECT'), 'measurement excludes query, parameters and profile values');
$probe->begin(); $blocked = false;
try { $db->createCommand('CREATE TABLE forbidden (id INTEGER)')->execute(); } catch (RuntimeException) { $blocked = true; }
$probe->end();
verify($blocked && !$db->createCommand("SELECT name FROM sqlite_master WHERE name = 'forbidden'")->queryScalar(), 'active ordinary-read probe blocks writes before execution');
$probe->begin(); $failed = false;
try { $db->createCommand('SELECT * FROM missing_table')->queryAll(); } catch (Throwable) { $failed = true; }
$measurement = $probe->end();
verify($failed && $measurement['query_count'] === 1 && $measurement['groups']['other']['failures'] === 1, 'failed queries are counted without exporting exception text');
verify(!str_contains(json_encode($measurement), 'missing_table'), 'failure output excludes SQL table payload');
verify(QueryProbe::$active === null, 'measurement lifecycle leaves no active observer');
echo json_encode(['status' => 'passed', 'checks' => count($checks), 'checks_passed' => $checks, 'database' => 'ephemeral SQLite only', 'network_calls' => 0, 'model_calls' => 0], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR), PHP_EOL;
