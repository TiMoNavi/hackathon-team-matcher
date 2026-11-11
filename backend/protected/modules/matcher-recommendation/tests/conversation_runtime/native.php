<?php
declare(strict_types=1);
defined('YII_ENABLE_ERROR_HANDLER') || define('YII_ENABLE_ERROR_HANDLER', false);
$backend = dirname(__DIR__, 5); require $backend . '/protected/vendor/autoload.php'; require $backend . '/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub', $backend . '/protected/humhub'); Yii::setAlias('@humhub/modules/matcherRecommendation', dirname(__DIR__, 2));
require_once __DIR__ . '/Fixtures.php'; require_once dirname(__DIR__) . '/native_access/Fixtures.php';
use humhub\modules\matcherRecommendation\adapters\composition\NativeConversationFactory;
use humhub\modules\matcherRecommendation\adapters\conversation\{ConversationRuntimeSchema, PdoConversationRuntime};
use humhub\modules\matcherRecommendation\adapters\native\{NativeContactEligibilityReader, HistoryBackedContactEligibilityReader};
use humhub\modules\matcherRecommendation\contracts\CandidateRequest;
use humhub\modules\matcherRecommendation\tests\native_access\Fixtures as N;
use humhub\modules\matcherRecommendation\tests\ai_runs\Fixtures as F;
$checks = [];
function checkNativeRuntime(bool $ok, string $label): void { global $checks; if (!$ok) { throw new RuntimeException($label); } $checks[] = $label; }
function rejectsNativeRuntime(callable $action, string $reason, string $label): void
{ try { $action(); } catch (Throwable $e) { checkNativeRuntime(($e->reason ?? null) === $reason, $label); return; } throw new RuntimeException('NOT REJECTED: ' . $label); }
$db = N::database(); $events = N::events($db); $f = F::create();
$app = new yii\console\Application(['id' => 'conversation-native-isolated', 'basePath' => __DIR__, 'vendorPath' => $backend . '/protected/vendor', 'components' => ['db' => $db, 'cache' => yii\caching\ArrayCache::class, 'runtimeCache' => yii\caching\ArrayCache::class, 'log' => ['targets' => []]]]);
$module = new humhub\modules\matcherRecommendation\Module('matcher-recommendation');
$module->pauseConversations(); checkNativeRuntime($db->getTableSchema('matcher_recommendation_runtime') === null, 'older ordinary-only installation may pause without runtime migration');
$factory = new NativeConversationFactory($db, $events, static fn(string $id) => null);
rejectsNativeRuntime(fn() => $factory->create(1, 7), 'storage_unavailable', 'unmigrated native factory is explicitly unavailable');
require dirname(__DIR__, 2) . '/migrations/m261112_000002_conversation_runtime.php';
(new m261112_000002_conversation_runtime(['db' => $db, 'compact' => true]))->up();
checkNativeRuntime((new PdoConversationRuntime($db->getMasterPdo()))->read()['enabled'] === false, 'actual Yii migration initializes disabled runtime');
rejectsNativeRuntime(fn() => $factory->create(1, 7), 'disabled', 'disabled native factory does not load P1 or AI');
$runtime = $factory->runtime(); $runtime->configure(1, true, 'synthetic-provider', 'v1');
rejectsNativeRuntime(fn() => $factory->create(1, 7), 'history_unavailable', 'switch alone cannot bypass native missing terminal friendship history');
$withHistory = new NativeConversationFactory($db, $events, static fn(string $id) => null, $f->contacts);
rejectsNativeRuntime(fn() => $withHistory->create(1, 7), 'platform_budget_unavailable', 'injected history alone cannot bypass missing platform allowance');
$withBoth = new NativeConversationFactory($db, $events, static fn(string $id) => null, $f->contacts, $f->platform);
rejectsNativeRuntime(fn() => $withBoth->create(1, 7), 'provider_unconfigured', 'history and platform cannot fabricate missing optional provider');
$native = new NativeContactEligibilityReader($db, $events); $bridge = new HistoryBackedContactEligibilityReader($native, $f->contacts, $events);
$context = $events->resolve(1, 7); $request = new CandidateRequest($context, 'person', ['5']);
checkNativeRuntime($bridge->readCurrent($request) === $native->readCurrent($request) && $f->contacts->currentRequests === [], 'history injection cannot override actual native current relationships');
$f->contacts->history['5'] = ['ever_sent' => true, 'version' => 'synthetic-history-5'];
checkNativeRuntime($bridge->readSentHistory($request)['5']['ever_sent'], 'explicit history capability remains separate from native current facts');
$module->pauseConversations('different-provider'); checkNativeRuntime($runtime->read()['enabled'], 'removing unrelated provider cannot pause active provider');
$module->pauseConversations('synthetic-provider'); checkNativeRuntime(!$runtime->read()['enabled'] && $runtime->read()['revision'] === 3, 'owning module pause rotates persistent revision before native disable');
$db->createCommand()->delete(ConversationRuntimeSchema::RUNTIME)->execute();
rejectsNativeRuntime(fn() => $module->pauseConversations(), 'storage_unavailable', 'existing corrupt runtime is not mistaken for missing migration');
$bad = new yii\db\Connection(['dsn' => 'sqlite:/nonexistent-directory-for-recommendation-test/missing.sqlite']); $app->set('db', $bad);
rejectsNativeRuntime(fn() => $module->pauseConversations(), 'storage_unavailable', 'database failure does not silently skip lifecycle invalidation');
Yii::$app = null;
echo json_encode(['suite' => 'conversation_native_runtime', 'status' => 'passed', 'checks' => count($checks), 'labels' => $checks, 'database' => 'fresh SQLite only', 'production_database_calls' => 0, 'network_calls' => 0, 'real_model_calls' => 0], JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT) . PHP_EOL;
