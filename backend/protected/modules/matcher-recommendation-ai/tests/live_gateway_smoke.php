<?php
declare(strict_types=1);
// Explicit opt-in CLI only. Synthetic people, no database or application boot. Never auto-discovered as a network test.
ini_set('display_errors', '0'); ini_set('zend.exception_ignore_args', '1');
if (PHP_SAPI !== 'cli' || ($argv[1] ?? null) !== '--allow-network' || !isset($argv[2])) { fwrite(STDERR, 'Explicit network opt-in and a private configuration file are required.' . PHP_EOL); exit(2); }
$workspaceRoot = dirname(__DIR__, 5); $modules = $workspaceRoot . '/backend/protected/modules';
require $modules . '/matcher-recommendation/tests/support/autoload.php';
require $modules . '/matcher-recommendation/tests/ai_runs/Fixtures.php';
spl_autoload_register(static function (string $class) use ($modules): void {
    $prefix = 'humhub' . chr(92) . 'modules' . chr(92) . 'matcherRecommendationAi' . chr(92);
    if (str_starts_with($class, $prefix)) {
        $path = $modules . '/matcher-recommendation-ai/' . str_replace(chr(92), '/', substr($class, strlen($prefix))) . '.php';
        if (is_file($path)) { require_once $path; }
    }
});
use humhub\modules\matcherRecommendationAi\adapters\gateway\{GatewayConfig, GatewayResponse, GatewayTransport, CurlGatewayTransport, ChatCompletionsClient};
use humhub\modules\matcherRecommendationAi\adapters\provider\{ChatQueryInterpreter, ChatCandidateReranker};
use humhub\modules\matcherRecommendation\tests\ai_runs\Fixtures as F;
use humhub\modules\matcherRecommendation\application\ai\{AiRecommendationService, SearchAiCandidates};
use humhub\modules\matcherRecommendation\contracts\{CurrentEventContext, QueryIntent};
use humhub\modules\matcherRecommendation\contracts\ports\CandidateRetriever;

final class SyntheticRetriever implements CandidateRetriever
{
    public int $calls = 0;
    public function recall(CurrentEventContext $context, QueryIntent $intent): array
    {
        $this->calls++;
        return array_map(static fn(int $id): array => ['target_type' => 'person', 'id' => (string)$id, 'routes' => ['structured' => $id - 1]], [2, 3, 4]);
    }
}

final class SmokeTransport implements GatewayTransport
{
    public array $observations = [];
    public function post(#[\SensitiveParameter] GatewayConfig $config, #[\SensitiveParameter] string $requestJson): GatewayResponse
    {
        $request = json_decode($requestJson, true, 32, JSON_THROW_ON_ERROR);
        $row = ['stage_schema' => $request['response_format']['json_schema']['name'] ?? null, 'request_bytes' => strlen($requestJson), 'max_tokens_requested' => $request['max_tokens'] ?? null];
        $start = hrtime(true);
        try {
            $response = (new CurlGatewayTransport())->post($config, $requestJson);
            $row['http_status'] = $response->status; $row['response_bytes'] = strlen($response->body());
            $body = json_decode($response->body(), true);
            $row['response_model'] = is_string($body['model'] ?? null) ? $body['model'] : null;
            $row['finish_reason'] = $body['choices'][0]['finish_reason'] ?? null;
            $choice = $body['choices'][0] ?? []; $message = $choice['message'] ?? [];
            $content = is_string($message['content'] ?? null) ? json_decode($message['content'], true) : null;
            $input = json_decode($request['messages'][1]['content'] ?? '{}', true);
            $allowed = [];
            foreach ($input['candidates'] ?? [] as $candidate) { foreach ($candidate['facts'] as $fact) { foreach ($fact['evidence_ids'] as $ref) { $allowed[$candidate['id']][$ref] = true; } } }
            $items = is_array($content['items'] ?? null) ? $content['items'] : []; $validRefs = true; $stringIds = true;
            foreach ($items as $item) { $stringIds = $stringIds && is_string($item['id'] ?? null); foreach ($item['evidence_ids'] ?? [] as $ref) { $validRefs = $validRefs && is_string($ref) && isset($allowed[$item['id'] ?? ''][$ref]); } }
            $row['shape_diagnostics'] = ['choice_index_zero' => ($choice['index'] ?? null) === 0, 'assistant_role' => ($message['role'] ?? null) === 'assistant', 'content_string' => is_string($message['content'] ?? null), 'content_json_object' => is_array($content) && !array_is_list($content), 'tool_calls_absent_or_null' => ($message['tool_calls'] ?? null) === null, 'tool_calls_empty_array' => ($message['tool_calls'] ?? null) === [], 'function_call_absent_or_null' => ($message['function_call'] ?? null) === null, 'refusal_absent_or_null' => ($message['refusal'] ?? null) === null, 'items_count' => count($items), 'item_ids_are_strings' => $stringIds, 'evidence_refs_match_sent_pool' => $validRefs];
            $row['usage'] = [];
            foreach (['prompt_tokens','completion_tokens','total_tokens'] as $key) { if (is_int($body['usage'][$key] ?? null)) { $row['usage'][$key] = $body['usage'][$key]; } }
            return $response;
        } finally { $row['elapsed_ms'] = round((hrtime(true)-$start)/1e6, 3); $this->observations[] = $row; }
    }
}

$transport = new SmokeTransport(); $scenarios = [];
try {
    $path = realpath($argv[2]); $allowed = realpath($workspaceRoot . '/.local');
    if ($path === false || $allowed === false || !str_starts_with($path, $allowed . DIRECTORY_SEPARATOR) || is_link($argv[2]) || (fileperms($path) & 0077) !== 0) { throw new RuntimeException(); }
    $private = json_decode(file_get_contents($path), true, 16, JSON_THROW_ON_ERROR);
    if (($private['base_url'] ?? null) !== 'https://timo.aitoken.credit/v1' || ($private['model'] ?? null) !== 'gemini-3.8-flash' || !is_string($private['api_key'] ?? null)) { throw new RuntimeException(); }
    $config = new GatewayConfig($private['base_url'], $private['model'], $private['api_key'], 1024); unset($private);
    $client = new ChatCompletionsClient($config, $transport);
    foreach (['structured', 'natural'] as $mode) {
        $fixture = F::create(3); $fixture->platform->remaining = 5;
        $fixture->providers->register('live-synthetic-gateway', new ChatQueryInterpreter($client), new ChatCandidateReranker($client));
        $retriever = new SyntheticRetriever();
        $search = new SearchAiCandidates($fixture->events, $retriever, $fixture->profiles, $fixture->contacts, $fixture->queryValidator, $fixture->policies);
        $service = new AiRecommendationService($fixture->events, $fixture->policies, $fixture->queryValidator, $search, $fixture->profiles, $fixture->contacts, $fixture->platform, $fixture->providers, $fixture->clock);
        $context = $fixture->events->context;
        $view = $mode === 'structured' ? $service->startStructured($context->viewerId, F::query(), $context->spaceId)
            : $service->startChat($context->viewerId, 'Synthetic test only: find someone sharing the interest social. Use topics similarity with value ["social"] as a soft preference. No other requirements and no clarification is needed.', $context->spaceId);
        $scenarios[] = ['mode' => $mode, 'interaction_status' => $view['interaction_status'], 'applicability' => $view['applicability'], 'model_calls_used' => $view['model_calls_used'], 'search_calls_used' => $view['search_calls_used'], 'repair_used' => $view['repair_used'], 'result_count' => count($view['items']), 'error' => $view['error'], 'selected_synthetic_ids' => array_map(static fn($item) => $item->id, $view['items'])];
        if ($view['interaction_status'] !== 'completed') { break; }
    }
    $passed = count($scenarios) === 2 && count(array_filter($scenarios, static fn(array $row): bool => $row['interaction_status'] === 'completed' && $row['applicability'] === 'current')) === 2;
    echo json_encode(['status' => $passed ? 'passed' : 'incomplete', 'synthetic_only' => true, 'existing_database_connected' => false, 'configured_model' => 'gemini-3.8-flash', 'generation_requests' => count($transport->observations), 'requests' => $transport->observations, 'scenarios' => $scenarios], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
    exit($passed ? 0 : 1);
} catch (Throwable $error) {
    echo json_encode(['status' => 'failed', 'synthetic_only' => true, 'error' => 'live_gateway_smoke_failed', 'error_class' => get_class($error), 'error_location' => basename($error->getFile()) . ':' . $error->getLine(), 'generation_requests' => count($transport->observations), 'requests' => $transport->observations, 'scenarios' => $scenarios], JSON_PRETTY_PRINT) . PHP_EOL;
    exit(1);
}
