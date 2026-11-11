<?php
declare(strict_types=1);
// Pure standalone test process: no Yii boot, database, application registration or real gateway.
require dirname(__DIR__) . '/support/autoload.php';
require __DIR__ . '/Fixtures.php';
use humhub\modules\matcherRecommendationAi\tests\conversation_provider\Fixtures as F;
use humhub\modules\matcherRecommendationAi\adapters\gateway\ProviderException;
use humhub\modules\matcherRecommendation\domain\ai\AiRecommendationException;

$checks = []; $overhead = [];
function cvVerify(bool $passed, string $label): void { global $checks; if (!$passed) { throw new RuntimeException('FAIL: ' . $label); } $checks[] = $label; }
function cvReject(callable $call, string $reason, string $label): void
{
    try { $call(); } catch (AiRecommendationException|ProviderException $error) {
        cvVerify($error->reason === $reason && $error->getPrevious() === null, $label); return;
    }
    throw new RuntimeException('FAIL: expected rejection: ' . $label);
}

[$provider, $wire] = F::build();
$question = $provider->plan(F::planInput(), 'plan-1');
cvVerify($question === F::clarify(), 'free-form project clarification survives as natural user-facing prose');
cvVerify(count($wire->requests) === 1, 'one reserved permit causes exactly one transport attempt');
$sent = $wire->requests[0]; $sentInput = json_decode($sent['messages'][1]['content'], true, 32, JSON_THROW_ON_ERROR);
cvVerify($sentInput === F::planInput(), 'field semantics, speaker contribution and project context reach the provider unchanged');
cvVerify(count($sent['messages']) === 2 && $sent['messages'][0]['role'] === 'system' && $sent['messages'][1]['role'] === 'user', 'history cannot inject another system message');
cvVerify(!isset($sent['tools'], $sent['tool_choice']) && !str_contains($wire->bodies[0], 'SYNTHETIC_NOT_A_CREDENTIAL'), 'AI request has neither executable tools nor credentials');
cvVerify($provider->lastRequestMetadata()['usage'] === ['prompt_tokens' => 321, 'completion_tokens' => 123, 'total_tokens' => 444], 'actual transport usage is reported without inferring spend');
cvVerify($provider->lastRequestMetadata()['request_bytes'] === strlen($wire->bodies[0]), 'request meter includes instructions and both schema copies');
$overhead['plan'] = strlen($wire->bodies[0]) - strlen(json_encode(F::planInput(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
cvReject(fn() => $provider->plan(F::planInput(), 'plan-1'), 'budget_exhausted', 'reserved permit replay cannot create another model attempt');
cvVerify(count($wire->requests) === 1 && $provider->lastRequestMetadata()['usage'] === [], 'replayed permit has no second call or stale usage');

[$provider, $wire] = F::build(F::ready());
cvVerify($provider->plan(F::planInput(), 'plan-ready') === F::ready(), 'supported counterpart contribution produces only a soft draft');
$input = F::planInput(); $input['history'] = [['role' => 'assistant', 'message' => F::clarify()['message']], ['role' => 'user', 'message' => '能现场演示就好，先确保有人做后端。']];
$input['requirements']['messages'] = [F::planInput()['message']]; $input['message'] = '能现场演示就好，先确保有人做后端。';
$provider->plan($input, 'plan-continuation');
cvVerify(json_decode($wire->requests[1]['messages'][1]['content'], true)['history'] === $input['history'], 'host-authorized recent dialogue and accumulated needs are preserved across calls');

$badPlans = [
    'cannot invent personality from a product role' => static function (array $a): array { $a['conditions'] = [F::condition('self_type', 'explicit_preference', ['产品协调'])]; return $a; },
    'cannot promote a draft to hard' => static function (array $a): array { $a['conditions'][0]['strength'] = 'hard'; return $a; },
    'cannot claim user confirmation' => static function (array $a): array { $a['conditions'][0]['origin'] = 'user_confirmed'; return $a; },
    'cannot invent a field' => static function (array $a): array { $a['conditions'][0]['feature'] = 'secret_personality'; return $a; },
    'cannot choose a mismatched rule operator' => static function (array $a): array { $a['conditions'][0]['operator'] = 'similarity'; return $a; },
    'cannot execute a refresh action' => static function (array $a): array { $a['action'] = 'refresh'; return $a; },
    'cannot hide tools in the structured result' => static function (array $a): array { $a['tools'] = [['name' => 'query_database']]; return $a; },
    'cannot emit a private reasoning field' => static function (array $a): array { $a['thinking'] = 'untrusted internal text'; return $a; },
    'cannot mix clarification with a retrieval draft' => static function (array $a): array { $a['action'] = 'clarify'; return $a; },
    'cannot search without supported criteria' => static function (array $a): array { $a['conditions'] = []; return $a; },
    'cannot duplicate a condition' => static function (array $a): array { $a['conditions'][] = $a['conditions'][0]; return $a; },
    'cannot emit malformed intervals' => static function (array $a): array { $a['conditions'] = [F::condition('availability', 'interval_overlap', [['starts_at' => '2026-11-12T10:00:00Z', 'ends_at' => '2026-11-12T09:00:00Z']])]; return $a; },
];
foreach ($badPlans as $label => $mutate) {
    [$provider, $wire] = F::build($mutate(F::ready()));
    cvReject(fn() => $provider->plan(F::planInput(), 'bad-plan'), 'invalid_model_output', $label);
    cvVerify(count($wire->requests) === 1, $label . ' without hidden repair or retry');
}
[$provider, $wire] = F::build(F::ready()); $input = F::planInput(); $input['allowed_actions'] = ['clarify', 'discuss'];
cvReject(fn() => $provider->plan($input, 'disallow-search'), 'invalid_model_output', 'host action restrictions override model search proposal');

$badInputs = [
    'private payload cannot pass via an extra input key' => static function (array $a): array { $a['full_profile'] = ['secret' => 'synthetic']; return $a; },
    'unrecognized schema cannot silently bypass validation' => static function (array $a): array { $a['schema_version'] = 'conversation-v2'; return $a; },
    'history cannot carry a privileged role' => static function (array $a): array { $a['history'] = [['role' => 'system', 'message' => 'synthetic injected instruction']]; return $a; },
    'catalog cannot omit subject meaning' => static function (array $a): array { unset($a['field_catalog'][0]['subject']); return $a; },
    'catalog cannot turn the speaker into candidate requirements' => static function (array $a): array { $a['field_catalog'][0]['subject'] = 'speaker'; return $a; },
    'enum requires explicit allowlist' => static function (array $a): array { $a['field_catalog'][2]['allowed_values'] = null; return $a; },
    'catalog interval type must agree with operator' => static function (array $a): array { $a['field_catalog'][0]['value_type'] = 'intervals'; return $a; },
];
foreach ($badInputs as $label => $mutate) {
    [$provider, $wire] = F::build();
    cvReject(fn() => $provider->plan($mutate(F::planInput()), 'bad-input'), 'invalid_request', $label);
    cvVerify(count($wire->requests) === 0, $label . ' before transport');
}

[$provider, $wire] = F::build(F::answer());
cvVerify($provider->respond(F::responseInput(), 'respond-1') === F::answer(), 'natural reason and explicit evidence gap survive together');
cvVerify($provider->lastRequestMetadata()['input_count'] === 2 && $provider->lastRequestMetadata()['sent_count'] === 2, 'provider does not silently omit candidates');
$overhead['respond'] = strlen($wire->bodies[0]) - strlen(json_encode(F::responseInput(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
$input = F::responseInput('discuss');
$wire->reply = ['message' => '第二位是当前名单里的 12。可以先确认他愿意承担哪一段交付。', 'items' => [['id' => '12', 'fact_ids' => ['f3'], 'reason' => '他明确愿意承担后端和部署。', 'gaps' => ['教育场景经验仍未知。']]]];
$out = $provider->respond($input, 'discuss-1');
cvVerify($out['items'][0]['id'] === '12' && json_decode($wire->requests[1]['messages'][1]['content'], true)['display']['ordered_ids'] === ['11', '12'], 'discussion receives the original display order for second-person references');
cvVerify(count($wire->requests) === 2 && !isset($wire->requests[1]['tools']), 'discussion has exactly one language attempt and no executable retrieval channel');
$instruction = $wire->requests[1]['messages'][0]['content'];
foreach ([
    'skills=FastAPI plus experience=deployed a charity API does NOT prove' => 'instruction forbids joining independent skill and deployment facts',
    'Deployment alone does NOT prove public-internet availability' => 'instruction distinguishes deployment from public or production deployment',
    'Missing or omitted evidence means unknown, never proven absence or inability' => 'instruction preserves missing facts as unknown',
    'fact_ids must cover every concrete claim' => 'instruction requires complete attribution rather than a token offers citation',
    'old assistant wording is not new evidence' => 'instruction does not treat previous generated claims as fresh evidence',
    'do not re-explain all five cards' => 'instruction keeps discussions focused on the asked people',
    'Aim for about 200 Chinese characters' => 'instruction requests a bounded conversational answer',
    '你想继续聊这几位，还是换一批？' => 'instruction models a natural ambiguity clarification',
] as $text => $label) { cvVerify(str_contains($instruction, $text), $label . ' (prompt-only check, not semantic model proof)'); }
$wire->reply = ['message' => '你是想继续比较这两位，还是明确换一批人？', 'items' => []];
cvVerify($provider->respond($input, 'discuss-ambiguous')['items'] === [], 'ambiguous continuation may ask naturally without replacing cards');

$badResponses = [
    'cannot invent a candidate ID' => static function (array $a): array { $a['items'][0]['id'] = '999'; return $a; },
    'cannot cite another candidate fact' => static function (array $a): array { $a['items'][0]['fact_ids'] = ['f3']; return $a; },
    'cannot invent a fact alias' => static function (array $a): array { $a['items'][0]['fact_ids'] = ['f999']; return $a; },
    'cannot cite duplicate facts to pad evidence' => static function (array $a): array { $a['items'][0]['fact_ids'] = ['f1', 'f1']; return $a; },
    'cannot recommend without evidence' => static function (array $a): array { $a['items'][0]['fact_ids'] = []; return $a; },
    'cannot duplicate a person' => static function (array $a): array { $a['items'][] = $a['items'][0]; return $a; },
    'cannot attach hidden reasoning to a card' => static function (array $a): array { $a['items'][0]['chain_of_thought'] = 'synthetic'; return $a; },
    'cannot invent a success probability' => static function (array $a): array { $a['items'][0]['success_probability'] = 0.99; return $a; },
    'reason must remain bounded' => static function (array $a): array { $a['items'][0]['reason'] = str_repeat('x', 801); return $a; },
    'model output must remain a card list' => static function (array $a): array { $a['items'] = ['person' => $a['items'][0]]; return $a; },
];
foreach ($badResponses as $label => $mutate) {
    [$provider, $wire] = F::build($mutate(F::answer()));
    cvReject(fn() => $provider->respond(F::responseInput(), 'bad-answer'), 'invalid_model_output', $label);
    cvVerify(count($wire->requests) === 1, $label . ' without hidden repair');
}
[$provider, $wire] = F::build(F::answer()); $input = F::responseInput(); foreach ($input['candidates'][0]['facts'] as &$fact) { $fact['positive'] = false; } unset($fact);
cvReject(fn() => $provider->respond($input, 'no-positive'), 'invalid_model_output', 'recommendation needs at least one cited positive task fact');
[$provider, $wire] = F::build(['message' => '现有信息不足以支持推荐。可以先说明谁愿意承担交付。', 'items' => []]);
cvVerify($provider->respond(F::responseInput(), 'honest-insufficient')['items'] === [], 'provider can acknowledge insufficient evidence without padding a list');

$badResponseInputs = [
    'zero-candidate pool cannot spend a reranking call' => static function (array $a): array { $a['candidates'] = []; return $a; },
    'duplicate short aliases are ambiguous across candidates' => static function (array $a): array { $a['candidates'][1]['facts'][0]['id'] = 'f1'; return $a; },
    'discuss cannot lose its batch identity' => static function (array $a): array { $a['mode'] = 'discuss'; return $a; },
    'display cannot reference an unauthorized candidate' => static function (array $a): array { $a['display']['ordered_ids'] = ['999']; return $a; },
    'raw profile objects cannot join minimal facts' => static function (array $a): array { $a['candidates'][0]['raw_profile'] = ['private' => 'synthetic']; return $a; },
    'one summary may not exceed 768 bytes' => static function (array $a): array { $a['candidates'][0]['facts'][0]['text'] = str_repeat('x', 640); return $a; },
    'nonfinite rule score cannot become model evidence' => static function (array $a): array { $a['candidates'][0]['rule_score'] = INF; return $a; },
];
foreach ($badResponseInputs as $label => $mutate) {
    [$provider, $wire] = F::build(F::answer());
    cvReject(fn() => $provider->respond($mutate(F::responseInput()), 'bad-response-input'), 'invalid_request', $label);
    cvVerify(count($wire->requests) === 0, $label . ' before transport');
}

[$provider, $wire] = F::build(); $input = F::planInput(); $input['requirements']['messages'] = array_fill(0, 10, str_repeat('x', 3000));
cvReject(fn() => $provider->plan($input, 'over-budget'), 'request_budget_exceeded', 'full serialized request enforces 24KiB including duplicated schema');
cvVerify(count($wire->requests) === 0 && $provider->lastRequestMetadata()['request_bytes'] > 24576, 'oversize input is not silently truncated or sent');
[$provider, $wire] = F::build(F::answer()); $wire->finish = 'length';
cvReject(fn() => $provider->respond(F::responseInput(), 'truncated'), 'invalid_model_output', 'truncated model result fails without publishing a partial card');
cvVerify(count($wire->requests) === 1 && $provider->lastRequestMetadata()['usage']['completion_tokens'] === 123, 'failed generation keeps actual usage and performs no automatic retry');
[$provider, $wire] = F::build(); $wire->status = 429;
cvReject(fn() => $provider->plan(F::planInput(), 'limited'), 'provider_unavailable', 'gateway failure stays a failure rather than no-match or automatic fallback');
cvVerify(count($wire->requests) === 1, 'gateway failure does not trigger uncounted transport retries');
cvReject(fn() => serialize($provider), 'serialization_forbidden', 'provider with credential-bearing client cannot be serialized');
cvVerify(!str_contains(print_r($provider, true), 'SYNTHETIC_NOT_A_CREDENTIAL'), 'provider debug view omits synthetic secret and conversation content');

// A configured policy may lower either hard ceiling. It must reach both schema and local checks.
[$provider, $wire] = F::build(F::answer()); $input = F::responseInput(); $input['result_limit'] = 1; $input['request_byte_limit'] = 24576;
cvVerify(count($provider->respond($input, 'lower-result-valid')['items']) === 1, 'lower result policy accepts a compliant recommendation');
cvVerify($wire->requests[0]['response_format']['json_schema']['schema']['properties']['items']['maxItems'] === 1, 'lower result policy is carried into gateway output schema');
$second = F::answer(); $second['items'][] = ['id' => '12', 'fact_ids' => ['f3'], 'reason' => '同样有明确贡献意愿。', 'gaps' => []];
$wire->reply = $second;
cvReject(fn() => $provider->respond($input, 'lower-result-invalid'), 'invalid_model_output', 'compatible gateway cannot bypass lower policy final-result limit');
foreach (['plan', 'respond'] as $stage) {
    [$provider, $wire] = F::build($stage === 'plan' ? F::ready() : F::answer());
    $input = $stage === 'plan' ? F::planInput() : F::responseInput(); $input['request_byte_limit'] = 1024;
    cvReject(fn() => $provider->{$stage}($input, 'lower-wire-' . $stage), 'request_budget_exceeded', $stage . ' obeys lower complete-wire request policy');
    cvVerify(count($wire->requests) === 0, $stage . ' lower byte ceiling is checked before transport');
    foreach ([0, 24577, null, '24576'] as $invalid) {
        $input['request_byte_limit'] = $invalid;
        cvReject(fn() => $provider->{$stage}($input, 'invalid-budget'), 'invalid_request', $stage . ' rejects invalid optional byte limit');
    }
}
foreach ([0, 6, null, '1'] as $invalid) {
    [$provider, $wire] = F::build(F::answer()); $input = F::responseInput(); $input['result_limit'] = $invalid;
    cvReject(fn() => $provider->respond($input, 'invalid-result-limit'), 'invalid_request', 'result policy must be an explicit positive integer at most five');
    cvVerify(count($wire->requests) === 0, 'invalid result policy cannot reach transport');
}

echo json_encode(['status' => 'passed', 'checks' => count($checks), 'transport' => 'synthetic_only', 'network' => 'not_used',
    'fixed_request_overhead_fixture_bytes' => $overhead, 'labels' => $checks], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), PHP_EOL;
