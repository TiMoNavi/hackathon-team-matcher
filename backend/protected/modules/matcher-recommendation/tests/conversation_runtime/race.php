<?php
declare(strict_types=1);
require_once __DIR__ . '/Fixtures.php';
use humhub\modules\matcherRecommendation\adapters\conversation\{PdoConversationRuntime, PdoRecommendationBudget};
use humhub\modules\matcherRecommendation\tests\ai_runs\{Platform, TestClock};
$db = new PDO('sqlite:' . $argv[1]); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $db->exec('PRAGMA busy_timeout=5000');
$runtime = new PdoConversationRuntime($db); $platform = new Platform();
$budget = new PdoRecommendationBudget($db, $platform, $runtime, $runtime->identity(), new TestClock());
echo "READY\n"; fflush(STDOUT); fgets(STDIN);
if ($argv[2] === 'create') {
    $f = \humhub\modules\matcherRecommendation\tests\ai_runs\Fixtures::create();
    $provider = new \humhub\modules\matcherRecommendation\tests\conversation_runtime\Provider();
    $store = new \humhub\modules\matcherRecommendation\adapters\conversation\PdoConversationStore($db);
    $service = new \humhub\modules\matcherRecommendation\application\conversation\ConversationService(
        $f->events, $f->policies, $f->queryValidator, $f->search, $f->profiles, $f->contacts, $budget, $provider, $store, $f->clock,
        new \humhub\modules\matcherRecommendation\domain\conversation\ConversationLimits(20, 40), $runtime->identity(), $runtime);
    echo $service->create(1, 7, 'same-concurrent-creation-key')['conversation_id'] . ':' . $provider->calls . PHP_EOL; exit;
}
try { $budget->reserveAttempt('run-race', 'plan', $argv[2]); echo 'RESERVED'; } catch (Throwable) { echo 'DENIED'; }
echo ':' . count($platform->reservations) . PHP_EOL;
