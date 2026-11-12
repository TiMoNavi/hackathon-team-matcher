<?php
declare(strict_types=1);
require dirname(__DIR__) . '/application/Bootstrap.php';
require dirname(__DIR__) . '/application/ReadBootstrap.php';
use humhub\modules\matcherChatUi\application\ReadBootstrap;
$checks = 0;
$assert = static function (bool $ok) use (&$checks): void { if (!$ok) { throw new LogicException('Read bootstrap check failed.'); } ++$checks; };
$reject = static function (callable $call) use ($assert): void { try { $call(); } catch (InvalidArgumentException $e) { $assert(true); return; } throw new LogicException('Invalid read bootstrap accepted.'); };
$data = ReadBootstrap::data('</script><script>synthetic</script>', '/dashboard/dashboard', '/user/auth/login', 1);
$json = ReadBootstrap::json($data);
$assert(count($data) === 10 && $data['schema_version'] === 2 && $data['integration_stage'] === 'read');
$assert(!str_contains($json, '<') && json_decode($json, true)['csrf_token'] === $data['csrf_token']);
foreach ([0, -1, 9007199254740992] as $id) { $reject(static fn() => ReadBootstrap::data('synthetic', '/dashboard/dashboard', '/user/auth/login', $id)); }
foreach (['actor_id' => '1', 'schema_version' => 1, 'integration_stage' => 'shell', 'native_chat_url' => '//example.invalid', 'current_event' => 1, 'capabilities' => ['send' => true]] as $key => $value) {
    $reject(static fn() => ReadBootstrap::json([...$data, $key => $value]));
}
$assert(ReadBootstrap::data('synthetic', '/dashboard/dashboard', '/user/auth/login', 9007199254740991)['actor_id'] === 9007199254740991);
echo json_encode(['status' => 'passed', 'checks' => $checks, 'database_access' => false, 'network_access' => false]), PHP_EOL;
