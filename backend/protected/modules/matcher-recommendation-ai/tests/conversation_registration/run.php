<?php
declare(strict_types=1);
// Explicit test providers only. No application boot, credentials, database or network.
$backend = dirname(__DIR__, 5);
require $backend . '/protected/vendor/autoload.php';
require $backend . '/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub', $backend . '/protected/humhub');
require dirname(__DIR__) . '/support/autoload.php';

use humhub\modules\matcherRecommendation\application\ai\AiProviderRegistry;
use humhub\modules\matcherRecommendation\contracts\QueryIntent;
use humhub\modules\matcherRecommendation\contracts\ports\{CandidateReranker, ConversationProvider, QueryInterpreter};
use humhub\modules\matcherRecommendation\domain\ai\AiRecommendationException;
use humhub\modules\matcherRecommendationAi\Module;

$checks = [];
function check(bool $ok, string $label): void
{
    global $checks;
    if (!$ok) { throw new RuntimeException('FAIL: ' . $label); }
    $checks[] = $label;
}
function rejects(callable $call, string $label, ?string $reason = null): void
{
    try { $call(); }
    catch (Throwable $error) {
        check($reason === null || ($error instanceof AiRecommendationException && $error->reason === $reason), $label);
        return;
    }
    check(false, $label);
}
function module(): Module { return (new ReflectionClass(Module::class))->newInstanceWithoutConstructor(); }
function conversation(): ConversationProvider
{
    return new class implements ConversationProvider {
        public int $calls = 0;
        public function plan(array $input, string $permit): array
        {
            $this->calls++;
            return ['action' => 'clarify', 'message' => '希望对方负责什么？', 'conditions' => []];
        }
        public function respond(array $input, string $permit): array
        {
            $this->calls++;
            return ['message' => '目前没有满足条件的人选。', 'items' => []];
        }
    };
}
$interpreter = new class implements QueryInterpreter {
    public int $calls = 0;
    public function interpret(array $minimalInput, string $callPermit): array { $this->calls++; return []; }
};
$reranker = new class implements CandidateReranker {
    public int $calls = 0;
    public function rerank(QueryIntent $intent, array $summaries, string $callPermit): array { $this->calls++; return []; }
};
$registry = new AiProviderRegistry();
$plugin = module();
check(!$plugin->hasProviders() && !$plugin->hasConversationProvider(), 'loading the module shell creates no default capability');
foreach (['identity', 'interpreter', 'reranker', 'conversationIdentity', 'conversation'] as $method) {
    rejects(fn() => $registry->$method(), 'empty registry rejects ' . $method, 'provider_unconfigured');
}
rejects(fn() => $plugin->getConversationProvider(), 'unconfigured conversation getter fails explicitly');
rejects(fn() => $plugin->attachConversation($registry), 'unconfigured attach does not fabricate a provider');
rejects(fn() => $registry->conversationIdentity(), 'failed attach leaves conversation slot absent', 'provider_unconfigured');

$provider = conversation();
$plugin->setConversationProvider($provider);
check($plugin->hasConversationProvider() && !$plugin->hasProviders(), 'conversation can be configured without legacy providers');
check($plugin->getConversationProvider() === $provider, 'module returns the explicitly injected conversation provider');
rejects(fn() => $registry->conversation(), 'configuration alone does not register a capability', 'provider_unconfigured');
$generation = $plugin->attachConversation($registry);
check(strlen($generation) === 48 && ctype_xdigit($generation), 'explicit attach issues an opaque conversation generation');
check($registry->conversationIdentity() === $generation && $registry->conversation() === $provider, 'conversation registration resolves provider and generation together');
rejects(fn() => $registry->interpreter(), 'conversation registration does not fabricate a legacy interpreter', 'provider_unconfigured');
rejects(fn() => $registry->reranker(), 'conversation registration does not fabricate a legacy reranker', 'provider_unconfigured');
check($provider->calls === 0, 'configure attach and lookup invoke no model method');
check($registry->conversation()->plan([], 'synthetic-plan-permit')['action'] === 'clarify', 'registered provider preserves plan protocol');
check($registry->conversation()->respond([], 'synthetic-response-permit')['items'] === [], 'registered provider preserves response protocol');
check($provider->calls === 2, 'explicit test invocation calls only the injected provider');

$plugin->setProviders($interpreter, $reranker);
$legacyGeneration = $plugin->attach($registry);
check($registry->interpreter() === $interpreter && $registry->reranker() === $reranker, 'legacy attach and access remain compatible');
check($registry->identity() === $legacyGeneration && $registry->conversationIdentity() === $generation, 'legacy registration does not mutate the conversation generation');
$replacement = conversation();
$plugin->setConversationProvider($replacement);
check($registry->conversation() === $provider, 'reconfiguring a module requires explicit reattachment');
$replacementGeneration = $plugin->attachConversation($registry);
check($replacementGeneration !== $generation && $registry->conversation() === $replacement, 'reattachment replaces the conversation provider and rotates generation');
check($registry->identity() === $legacyGeneration && $registry->interpreter() === $interpreter, 'conversation replacement leaves legacy capability and generation intact');

foreach (['', 'Bad-ID', '../provider', 'provider/other', str_repeat('a', 65)] as $invalidId) {
    rejects(fn() => $registry->registerConversation($invalidId, $provider), 'invalid conversation registration ID is rejected: ' . strlen($invalidId), 'invalid_request');
    check($registry->conversationIdentity() === $replacementGeneration && $registry->conversation() === $replacement, 'invalid registration preserves the existing capability');
}
$registry->unregister('unrelated-provider');
check($registry->identity() === $legacyGeneration && $registry->conversationIdentity() === $replacementGeneration, 'unrelated detach preserves both capabilities');
$plugin->detach($registry);
foreach (['identity', 'interpreter', 'reranker', 'conversationIdentity', 'conversation'] as $method) {
    rejects(fn() => $registry->$method(), 'plugin detach clears its ' . $method, 'provider_unconfigured');
}
$plugin->detach($registry);
check(true, 'repeated detach is idempotent');
$newGeneration = $plugin->attachConversation($registry);
check($newGeneration !== $replacementGeneration, 'detach and reattach never reuse a conversation generation');
$plugin->detach($registry);
rejects(fn() => $registry->conversation(), 'conversation-only detach works when the legacy slot is empty', 'provider_unconfigured');

$legacyGeneration = $registry->register('legacy-package', $interpreter, $reranker);
$conversationGeneration = $registry->registerConversation('conversation-package', $provider);
$registry->unregister('legacy-package');
rejects(fn() => $registry->identity(), 'legacy-only detach clears the legacy registration', 'provider_unconfigured');
check($registry->conversationIdentity() === $conversationGeneration, 'legacy-only detach preserves a differently owned conversation capability');
$legacyGeneration = $registry->register('legacy-package', $interpreter, $reranker);
$registry->unregister('conversation-package');
rejects(fn() => $registry->conversation(), 'conversation owner can detach its independent slot', 'provider_unconfigured');
check($registry->identity() === $legacyGeneration, 'conversation-only detach preserves a differently owned legacy capability');

check($interpreter->calls === 0 && $reranker->calls === 0 && $replacement->calls === 0, 'registration lifecycle never invokes injected model capabilities');
$registry->registerConversation('conversation-package', $provider);
check($registry->__debugInfo() === ['registered' => true, 'conversation_registered' => true], 'registry debug exposes capability presence without providers or generations');
check($plugin->__debugInfo() === ['id' => 'matcher-recommendation-ai', 'configured' => true, 'conversation_configured' => true], 'module debug exposes only configuration presence');
rejects(fn() => serialize($registry), 'registry cannot serialize provider capabilities');
rejects(fn() => serialize($plugin), 'module cannot serialize provider capabilities');
$config = require dirname(__DIR__, 2) . '/config.php';
check($config['events'] === [] && $config['urlManagerRules'] === [], 'optional package still adds no boot hook or public route');
$metadata = json_decode(file_get_contents(dirname(__DIR__, 2) . '/module.json'), true, 32, JSON_THROW_ON_ERROR);
check(array_keys($metadata['humhub']['modules']) === ['matcher-recommendation'], 'AI package remains a one-way optional main-module dependency');

echo json_encode(['status' => 'passed', 'scope' => 'Process-local explicit capability registration only; not production conversation wiring or persistent job lifecycle.',
    'checks' => count($checks), 'checks_passed' => $checks, 'network_calls' => 0, 'model_calls' => 0, 'database_calls' => 0], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
