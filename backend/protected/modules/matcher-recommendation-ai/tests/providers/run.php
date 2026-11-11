<?php
declare(strict_types=1);
// Every request uses FakeTransport; cURL/network functions are disabled by the documented command.
$backend = dirname(__DIR__, 5);
require $backend . '/protected/vendor/autoload.php'; require $backend . '/protected/vendor/yiisoft/yii2/Yii.php';
Yii::setAlias('@humhub', $backend . '/protected/humhub');
require dirname(__DIR__) . '/support/autoload.php'; require __DIR__ . '/Fixtures.php';
use humhub\modules\matcherRecommendation\contracts\QueryIntent;
use humhub\modules\matcherRecommendation\domain\ai\AiRecommendationException;
use humhub\modules\matcherRecommendation\application\ai\AiProviderRegistry;
use humhub\modules\matcherRecommendationAi\Module;
use humhub\modules\matcherRecommendationAi\adapters\gateway\{ChatCompletionsClient, CurlGatewayTransport, GatewayConfig, GatewayResponse, GatewayTransport, ProviderException};
use humhub\modules\matcherRecommendationAi\adapters\provider\{ChatQueryInterpreter, ChatCandidateReranker, ProtocolShape};
use humhub\modules\matcherRecommendationAi\tests\providers\FakeTransport;

$checks = [];
function apVerify(bool $ok, string $label): void { global $checks; if (!$ok) { throw new RuntimeException('FAIL: ' . $label); } $checks[] = $label; }
function apReject(callable $call, string $label, ?string $reason = null): void {
    try { $call(); } catch (Throwable $error) { apVerify($reason === null || (($error instanceof ProviderException || $error instanceof AiRecommendationException) && $error->reason === $reason && $error->getPrevious() === null), $label); return; }
    apVerify(false, $label);
}
function apInput(): array { return ['target_type' => 'person', 'message' => '想找机器人项目伙伴', 'allowed_conditions' => [['feature' => 'topics', 'operator' => 'similarity']], 'schema_version' => 'query-v1', 'prompt_version' => 'recommendation-v1', 'selected_self_attributes' => [], 'clarifications' => []]; }
function apIntent(array $value = ['robotics']): QueryIntent { return new QueryIntent('person', [['feature' => 'topics', 'operator' => 'similarity', 'value' => $value, 'strength' => 'soft', 'origin' => 'user_confirmed']]); }
function apSummary(string $id = '2', string $text = 'topics=["robotics"]'): array { return ['target_type' => 'person', 'id' => $id, 'rule_score' => .8, 'facts' => [['text' => $text, 'evidence_ids' => ['e-' . hash('sha256', 'synthetic-evidence-' . $id)]]], 'unknown_features' => [], 'unknown_count' => 0, 'omitted_fact_count' => 0]; }
function apClient(?FakeTransport $transport = null): array {
    $transport ??= new FakeTransport(); $config = new GatewayConfig('https://synthetic.invalid/v1', 'synthetic-model', 'SYNTHETIC_KEY_NEVER_REAL');
    $client = new ChatCompletionsClient($config, $transport); return [$client, $transport, $config];
}
function apItems(array $summaries): array { return ['items' => array_map(static fn(array $s): array => ['target_type' => 'person', 'id' => $s['id'], 'evidence_ids' => $s['facts'][0]['evidence_ids']], array_slice($summaries, 0, 5))]; }
function apRecordingClient(): array {
    $fake = new FakeTransport(); $config = new GatewayConfig('https://synthetic.invalid/v1', 'synthetic-model', 'SYNTHETIC_KEY_NEVER_REAL');
    $recording = new class($fake) implements GatewayTransport {
        public array $bodies = [];
        public function __construct(private readonly FakeTransport $fake) {}
        public function post(GatewayConfig $config, string $json): GatewayResponse { $this->bodies[] = $json; return $this->fake->post($config, $json); }
    };
    return [new ChatCompletionsClient($config, $recording), $fake, $recording];
}
/** Split only the final client-added schema suffix; the original caller messages must remain reusable. */
function apPromptParts(array $request): array {
    $messages = $request['messages']; $marker = "\nRequired JSON output schema (return only this object, no Markdown): ";
    $position = strrpos($messages[0]['content'], $marker);
    if ($position === false) { throw new RuntimeException('System instruction lacks the required output schema.'); }
    $schema = json_decode(substr($messages[0]['content'], $position + strlen($marker)), true, 32, JSON_THROW_ON_ERROR);
    $messages[0]['content'] = substr($messages[0]['content'], 0, $position);
    return [$messages, $schema];
}

foreach (['http://synthetic.invalid/v1', 'https://user:secret@synthetic.invalid/v1', 'https://synthetic.invalid/v1?key=synthetic', 'https://synthetic.invalid/v1#fragment', 'https://synthetic.invalid/a/../v1', 'https://synthetic.invalid/%2e%2e/v1', 'https://synthetic.invalid/v1/https:other'] as $url) {
    apReject(fn() => new GatewayConfig($url, 'synthetic-model', 'synthetic-key'), 'unsafe or ambiguous configured gateway URL is rejected', 'invalid_configuration');
}
apReject(fn() => new GatewayConfig('https://synthetic.invalid/v1', 'model', "key\r\nInjected: yes"), 'header injection in configured key is rejected', 'invalid_configuration');
apReject(fn() => new GatewayConfig('https://synthetic.invalid/v1', 'model', 'key', 0), 'output token ceiling must be positive', 'invalid_configuration');
[$client, $transport, $config] = apClient();
apVerify($config->endpoint() === 'https://synthetic.invalid/v1/chat/completions' && $config->maxTokens() === 1024, 'explicit API prefix and token ceiling require no inferred endpoint or model defaults');
$interpreter = new ChatQueryInterpreter($client); $out = $interpreter->interpret(apInput(), 'synthetic-permit-1');
apVerify($out['status'] === 'ready' && $out['conditions'][0]['strength'] === 'soft' && $out['conditions'][0]['origin'] === 'interpreted_draft', 'query interpreter returns only a schema-checked soft draft');
$request = $transport->requests[0];
apVerify($request['max_tokens'] === 1024 && $request['response_format']['type'] === 'json_schema' && $request['response_format']['json_schema']['strict'] === true, 'wire request explicitly asks for JSON schema and bounded output tokens');
apVerify(!isset($request['temperature'], $request['top_p'], $request['tools'], $request['tool_choice']) && !str_contains(json_encode($request), 'SYNTHETIC_KEY_NEVER_REAL'), 'wire payload contains neither sampling defaults tools nor gateway credentials');
apVerify($interpreter->lastRequestMetadata()['usage'] === ['prompt_tokens' => 100, 'completion_tokens' => 40, 'total_tokens' => 140], 'usage reporting retains only numeric gateway token counts');
apReject(fn() => $interpreter->interpret(apInput(), 'synthetic-permit-1'), 'same model call permit cannot be reused by an interpreter', 'budget_exhausted');
apVerify($transport->calls === 1, 'permit replay makes no second transport attempt');

// Compatible gateways may accept response_format without enforcing it: both prompt and local checks remain explicit.
foreach (['interpretation', 'ranking'] as $stage) {
    [$client, $transport, $wire] = apRecordingClient();
    if ($stage === 'interpretation') { $provider = new ChatQueryInterpreter($client); $provider->interpret(apInput(), 'schema-' . $stage); }
    else {
        $transport->handler = static function (array $request): GatewayResponse { $input = json_decode($request['messages'][1]['content'], true, 32, JSON_THROW_ON_ERROR); return FakeTransport::answer(apItems($input['candidates'])); };
        $provider = new ChatCandidateReranker($client); $provider->rerank(apIntent(), [apSummary()], 'schema-' . $stage);
    }
    $request = $transport->requests[0]; [$originalMessages, $promptSchema] = apPromptParts($request); $format = $request['response_format']['json_schema'];
    apVerify($promptSchema === $format['schema'], $stage . ' system instruction and response_format contain exactly the same JSON schema');
    $bytes = strlen($wire->bodies[0]);
    apVerify($client->requestBytes($originalMessages, $format['schema'], $format['name']) === $bytes
        && $provider->lastRequestMetadata()['request_bytes'] === $bytes && $client->lastRequestMetadata()['request_bytes'] === $bytes,
        $stage . ' byte estimate and both metadata views equal the actual serialized transport body including schema twice');
    apVerify($transport->calls === 1 && !str_contains($originalMessages[0]['content'], 'Required JSON output schema'),
        $stage . ' byte preview does not resend or recursively append schema to the original messages');
}

foreach (['viewer_id', 'event_id', 'sql', 'url', 'tools', 'profiles'] as $key) {
    [$client, $transport] = apClient(); $input = apInput(); $input[$key] = 'synthetic-forbidden';
    apReject(fn() => (new ChatQueryInterpreter($client))->interpret($input, 'permit-' . $key), 'query input rejects authority or extra field ' . $key, 'invalid_request');
    apVerify($transport->calls === 0, 'forbidden input is rejected before model request: ' . $key);
}
[$client, $transport] = apClient(); $transport->handler = fn() => FakeTransport::answer(['status' => 'clarification', 'conditions' => [], 'question' => ['text' => '希望侧重哪一类合作？', 'options' => ['同好交流', '项目协作']]]);
apVerify((new ChatQueryInterpreter($client))->interpret(apInput(), 'clarification-permit')['status'] === 'clarification', 'valid clarification is structured output rather than another tool call');
foreach ([
    'hard condition' => ['status' => 'ready', 'conditions' => [['feature' => 'topics', 'operator' => 'similarity', 'value' => ['robotics'], 'strength' => 'hard', 'origin' => 'user_confirmed']], 'question' => null],
    'unknown feature' => ['status' => 'ready', 'conditions' => [['feature' => 'private_contact', 'operator' => 'similarity', 'value' => ['secret'], 'strength' => 'soft', 'origin' => 'interpreted_draft']], 'question' => null],
    'invented action' => ['status' => 'ready', 'conditions' => [], 'question' => null, 'send_message' => true],
    'unbounded question options' => ['status' => 'clarification', 'conditions' => [], 'question' => ['text' => 'Choose', 'options' => ['a', 'b', 'c', 'd']]],
] as $name => $bad) {
    [$client, $transport] = apClient(); $transport->handler = fn() => FakeTransport::answer($bad);
    apReject(fn() => (new ChatQueryInterpreter($client))->interpret(apInput(), 'bad-' . str_replace(' ', '-', $name)), 'model output rejects ' . $name, 'invalid_model_output');
    apVerify($transport->calls === 1, 'invalid output is not invisibly repaired: ' . $name);
}

foreach ([401, 403, 429, 302, 500] as $status) {
    [$client, $transport] = apClient(); $transport->handler = fn() => new GatewayResponse($status, '{"error":"SYNTHETIC_PROVIDER_PRIVATE_BODY"}');
    apReject(fn() => (new ChatQueryInterpreter($client))->interpret(apInput(), 'http-' . $status), 'HTTP ' . $status . ' maps to unavailable without a repairable model-output error', 'provider_unavailable');
    apVerify($transport->calls === 1, 'HTTP ' . $status . ' gets one attempt only');
}
foreach (['malformed_json', 'truncated', 'tool_calls', 'refusal', 'extra_choice', 'fenced_content'] as $case) {
    [$client, $transport] = apClient();
    $transport->handler = function () use ($case): GatewayResponse {
        if ($case === 'malformed_json') { return new GatewayResponse(200, '{'); }
        $body = json_decode(FakeTransport::answer(['status' => 'ready', 'conditions' => [], 'question' => null])->body(), true);
        if ($case === 'truncated') { $body['choices'][0]['finish_reason'] = 'length'; }
        if ($case === 'tool_calls') { $body['choices'][0]['message']['tool_calls'] = [['function' => ['name' => 'read_database']]]; }
        if ($case === 'refusal') { $body['choices'][0]['message']['refusal'] = 'SYNTHETIC_REFUSAL'; }
        if ($case === 'extra_choice') { $body['choices'][] = $body['choices'][0]; }
        if ($case === 'fenced_content') { $body['choices'][0]['message']['content'] = '~~~json {} ~~~'; }
        return new GatewayResponse(200, json_encode($body));
    };
    apReject(fn() => (new ChatQueryInterpreter($client))->interpret(apInput(), 'response-' . $case), 'strict gateway parser rejects ' . $case, 'invalid_model_output');
}

[$client, $transport] = apClient(); $transport->handler = function (): never { throw new RuntimeException('SYNTHETIC_TRANSPORT_SECRET_BODY'); };
$oldIgnore = ini_set('zend.exception_ignore_args', '0');
try { (new ChatQueryInterpreter($client))->interpret(apInput(), 'transport-failure'); }
catch (AiRecommendationException $error) { apVerify($error->reason === 'provider_unavailable' && $error->getPrevious() === null && !str_contains((string)$error, 'SYNTHETIC_TRANSPORT_SECRET_BODY'), 'transport exception contents and chains are removed at the main-port boundary'); }
finally { if ($oldIgnore !== false) { ini_set('zend.exception_ignore_args', $oldIgnore); } }

[$client, $transport] = apClient(); $summaries = [apSummary('2'), apSummary('3')]; $transport->handler = fn() => FakeTransport::answer(apItems(array_reverse($summaries)));
$reranker = new ChatCandidateReranker($client); $items = $reranker->rerank(apIntent(), $summaries, 'rerank-valid');
apVerify(array_column($items, 'id') === ['3', '2'] && $items[0]['evidence_ids'] === $summaries[1]['facts'][0]['evidence_ids'], 'reranker preserves model order only for actual pool IDs with owned evidence');
apVerify($reranker->lastRequestMetadata()['sent_count'] === 2 && $reranker->lastRequestMetadata()['request_bytes'] <= 24576 && !isset($transport->requests[0]['tools']), 'rerank records counts and exact request bytes while exposing no tools');
[$client, $transport] = apClient(); $reranker = new ChatCandidateReranker($client);
apVerify($reranker->rerank(apIntent(), [], 'empty-pool') === [] && $transport->calls === 0 && $reranker->lastRequestMetadata()['request_bytes'] === 0, 'empty pool never sends a model request');
foreach ([
    'missing items wrapper' => ['recommendations' => []],
    'foreign ID' => ['items' => [['target_type' => 'person', 'id' => '99', 'evidence_ids' => $summaries[0]['facts'][0]['evidence_ids']]]],
    'cross-person evidence' => ['items' => [['target_type' => 'person', 'id' => '2', 'evidence_ids' => $summaries[1]['facts'][0]['evidence_ids']]]],
    'duplicate person' => ['items' => [apItems($summaries)['items'][0], apItems($summaries)['items'][0]]],
    'empty evidence' => ['items' => [['target_type' => 'person', 'id' => '2', 'evidence_ids' => []]]],
    'invented score' => ['items' => [['target_type' => 'person', 'id' => '2', 'evidence_ids' => $summaries[0]['facts'][0]['evidence_ids'], 'score' => 100]]],
] as $name => $bad) {
    [$client, $transport] = apClient(); $transport->handler = fn() => FakeTransport::answer($bad);
    apReject(fn() => (new ChatCandidateReranker($client))->rerank(apIntent(), $summaries, 'bad-rank-' . str_replace(' ', '-', $name)), 'rerank rejects ' . $name, 'invalid_model_output');
}
[$client, $transport] = apClient(); $tooMany = array_map(fn($id) => apSummary((string)$id), range(2, 26));
apReject(fn() => (new ChatCandidateReranker($client))->rerank(apIntent(), $tooMany, 'too-many'), '25 candidates exceed count budget before transport', 'invalid_request');
$oversized = [apSummary('2', str_repeat('界', 300))];
apReject(fn() => (new ChatCandidateReranker($client))->rerank(apIntent(), $oversized, 'too-wide'), 'candidate budget counts actual UTF-8 bytes', 'invalid_request');
apVerify($transport->calls === 0, 'oversized candidate inputs do not send a request');

$pool = array_map(fn($id) => apSummary((string)$id, str_repeat('"', 210)), range(2, 25));
apVerify(max(array_map(fn($summary) => strlen(ProtocolShape::json($summary)), $pool)) <= 768, 'escaped-text pool respects individual 768-byte summary cap');
$largeIntent = apIntent([str_repeat('x', 1000), str_repeat('y', 1000), str_repeat('z', 1000)]);
[$client, $transport, $wire] = apRecordingClient();
$transport->handler = function (array $request): GatewayResponse { $data = json_decode($request['messages'][1]['content'], true); return FakeTransport::answer(apItems($data['candidates'])); };
$reranker = new ChatCandidateReranker($client); $items = $reranker->rerank($largeIntent, $pool, 'trim-request'); $meta = $reranker->lastRequestMetadata();
$sent = json_decode($transport->requests[0]['messages'][1]['content'], true)['candidates'];
apVerify($meta['input_count'] === 24 && $meta['sent_count'] < 24 && $meta['request_bytes'] <= 24576, 'complete escaped request including prompt and schema is bounded by tail reduction');
apVerify(array_column($sent, 'id') === array_slice(array_column($pool, 'id'), 0, count($sent)) && $transport->calls === 1, 'size reduction keeps deterministic prefix and uses only one transport attempt');
[$originalMessages, $promptSchema] = apPromptParts($transport->requests[0]); $format = $transport->requests[0]['response_format']['json_schema'];
apVerify($promptSchema === $format['schema'] && $meta['request_bytes'] === strlen($wire->bodies[0])
    && $client->requestBytes($originalMessages, $format['schema'], $format['name']) === strlen($wire->bodies[0]),
    'tail-reduced request retains identical schema copies and exact physical request size');
$reranker->rerank($largeIntent, $pool, 'trim-request-repeated');
apVerify($wire->bodies[0] === $wire->bodies[1] && $transport->calls === 2 && $reranker->lastRequestMetadata()['sent_count'] === count($sent)
    && count($pool) === 24, 'same oversized inputs deterministically keep the same prefix without mutating the caller pool');
[$client, $transport] = apClient(); $transport->handler = fn() => FakeTransport::answer(apItems([end($pool)]));
apReject(fn() => (new ChatCandidateReranker($client))->rerank($largeIntent, $pool, 'removed-person'), 'model cannot return a candidate removed from the actual sent subset', 'invalid_model_output');
[$client, $transport] = apClient();
apReject(fn() => (new ChatCandidateReranker($client))->rerank(apIntent(array_fill(0, 32, str_repeat('x', 1000))), [apSummary()], 'too-large-even-one'), 'request overhead that cannot fit even one candidate fails explicitly', 'request_budget_exceeded');
apVerify($transport->calls === 0, 'impossible complete-request budget is rejected before transport');
apReject(fn() => (new CurlGatewayTransport())->post($config, str_repeat('x', 24577)), 'real transport also enforces byte limit before cURL execution', 'request_too_large');

// The additional schema prompt must be part of the hard limit, including the exact one-byte boundary.
[$client, $transport, $wire] = apRecordingClient();
$schema = ProtocolShape::object(['items' => ['type' => 'array', 'maxItems' => 5, 'items' => ['type' => 'string']]]);
$messages = [['role' => 'system', 'content' => 'Return the declared JSON object.'], ['role' => 'user', 'content' => 'x']];
$baseBytes = $client->requestBytes($messages, $schema, 'boundary_probe');
$messages[1]['content'] = str_repeat('x', CurlGatewayTransport::MAX_REQUEST_BYTES - $baseBytes + 2);
apVerify($client->requestBytes($messages, $schema, 'boundary_probe') === CurlGatewayTransport::MAX_REQUEST_BYTES + 1,
    'requestBytes includes schema prompt overhead at the exact one-byte overflow boundary');
apReject(fn() => $client->complete($messages, $schema, 'boundary_probe', 'over-budget-schema'),
    'duplicated-schema complete request rejects one-byte overflow explicitly', 'request_too_large');
apVerify($transport->calls === 0 && $wire->bodies === [], 'over-budget schema prompt reaches neither fake transport nor any request body capture');
$messages[1]['content'] = substr($messages[1]['content'], 0, -1);
$transport->handler = static fn() => FakeTransport::answer(['items' => []]);
$client->complete($messages, $schema, 'boundary_probe', 'exact-budget-schema');
apVerify(strlen($wire->bodies[0]) === CurlGatewayTransport::MAX_REQUEST_BYTES
    && $client->requestBytes($messages, $schema, 'boundary_probe') === strlen($wire->bodies[0]) && $transport->calls === 1,
    'exact-limit duplicated-schema request sends once with byte-exact estimation');

[$client, $transport, $config] = apClient();
foreach ([$config, new GatewayResponse(200, 'SYNTHETIC_PRIVATE_RESPONSE'), $client, new ChatQueryInterpreter($client), new ChatCandidateReranker($client)] as $object) {
    ob_start(); var_dump($object); $debug = ob_get_clean(); $export = var_export($object, true);
    apVerify(!str_contains($debug . $export, 'SYNTHETIC_KEY_NEVER_REAL') && !str_contains($debug . $export, 'SYNTHETIC_PRIVATE_RESPONSE'), 'debug/export does not expose credential or response contents');
    apReject(fn() => serialize($object), 'credential-bearing provider object rejects serialization', 'serialization_forbidden');
    $oldIgnore = ini_set('zend.exception_ignore_args', '0');
    try { $object->__unserialize(['secret' => 'SYNTHETIC_UNSERIALIZE_PRIVATE']); }
    catch (ProviderException $error) { apVerify(!str_contains(json_encode($error->getTrace(), JSON_PARTIAL_OUTPUT_ON_ERROR), 'SYNTHETIC_UNSERIALIZE_PRIVATE'), 'forbidden unserialize input is also redacted from trace'); }
    finally { if ($oldIgnore !== false) { ini_set('zend.exception_ignore_args', $oldIgnore); } }
}
$registration = require dirname(__DIR__, 2) . '/config.php'; $metadata = json_decode(file_get_contents(dirname(__DIR__, 2) . '/module.json'), true, 32, JSON_THROW_ON_ERROR);
apVerify($registration['events'] === [] && $registration['urlManagerRules'] === [] && array_keys($metadata['humhub']['modules']) === ['matcher-recommendation'], 'AI package is a one-way optional dependency with no public route or boot hook');
$module = (new ReflectionClass(Module::class))->newInstanceWithoutConstructor();
apVerify(!$module->hasProviders(), 'module shell has no fake or automatic provider default');
apReject(fn() => $module->getQueryInterpreter(), 'unconfigured module fails explicitly');
$registry = new AiProviderRegistry(); $module->setProviders(new ChatQueryInterpreter($client), new ChatCandidateReranker($client));
$generation = $module->attach($registry);
apVerify(is_string($generation) && $registry->interpreter() instanceof ChatQueryInterpreter && $registry->reranker() instanceof ChatCandidateReranker, 'trusted module attach registers existing main-module ports explicitly');
$module->detach($registry); apReject(fn() => $registry->interpreter(), 'detach removes optional AI provider registration');

echo json_encode(['status' => 'passed', 'scope' => 'Synthetic fake-transport protocol and optional package tests; no external request, credentials, existing DB or module enablement.', 'passed' => count($checks), 'network_calls' => 0, 'checks' => $checks], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
