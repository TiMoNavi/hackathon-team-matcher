<?php
declare(strict_types=1);
// Full offline assembly: real conversation/search/rules/provider/client, synthetic ports and transport only.
require_once dirname(__DIR__) . '/support/autoload.php';
$mainModule = dirname(__DIR__, 3) . '/matcher-recommendation';
require_once $mainModule . '/tests/support/autoload.php';
require_once $mainModule . '/tests/ai_runs/Fixtures.php';
require_once $mainModule . '/tests/conversation_integration/Fixtures.php';
require_once __DIR__ . '/Fixtures.php';
use humhub\modules\matcherRecommendation\application\conversation\ConversationService;
use humhub\modules\matcherRecommendation\adapters\conversation\InMemoryConversationStore;
use humhub\modules\matcherRecommendation\contracts\QueryIntent;
use humhub\modules\matcherRecommendation\domain\conversation\ConversationLimits;
use humhub\modules\matcherRecommendation\tests\conversation_integration\{Fixtures as Corpus, CorpusRetriever};
use humhub\modules\matcherRecommendation\tests\rules\Fixtures as Rules;
use humhub\modules\matcherRecommendationAi\tests\conversation_provider\{Fixtures as ProviderFixtures, RecordingTransport};

$checks = []; $capturedBytes = []; $poolSizes = [];
function cviCheck(bool $ok, string $label): void { global $checks; if (!$ok) { throw new RuntimeException('FAIL: ' . $label); } $checks[] = $label; }
function cviHard(): QueryIntent
{
    return new QueryIntent('person', [
        Rules::condition('needs', 'supply_demand', ['后端开发'], 'hard'),
        Rules::condition('availability', 'interval_overlap', [['starts_at' => '2026-11-14T14:00:00+08:00', 'ends_at' => '2026-11-14T18:00:00+08:00']], 'hard'),
    ]);
}
function cviIds(array $view): array { return array_column($view['items'], 'id'); }
function cviBuild(array $users, bool $clarify = true, ?\Closure $override = null): array
{
    $ports = Corpus::ports($users); $ports->platform->remaining = 40;
    $retriever = new CorpusRetriever($ports, $users); $search = Corpus::search($ports, $retriever);
    $first = $clarify;
    [$provider, $wire] = ProviderFixtures::build(static function (array $request) use (&$first, $override): array {
        $input = json_decode($request['messages'][1]['content'], true, 32, JSON_THROW_ON_ERROR);
        if ($override !== null) { $result = $override($input, $request); if ($result !== null) { return $result; } }
        if ($request['response_format']['json_schema']['name'] === 'conversation_plan') {
            if ($first) { $first = false; return ['action' => 'clarify', 'message' => '两天后是现场演示还是给同学试用？搭档需要参加哪段联调时间？', 'conditions' => []]; }
            return ['action' => 'search', 'message' => '按你确认的交付目标与投入要求寻找搭档，教育经历作为偏好。',
                'conditions' => [['feature' => 'needs', 'operator' => 'supply_demand', 'value' => ['后端开发'], 'strength' => 'soft', 'origin' => 'interpreted_draft']]];
        }
        $items = [];
        foreach (array_slice($input['candidates'], 0, 5) as $candidate) {
            $positive = array_values(array_filter($candidate['facts'], static fn(array $fact): bool => $fact['positive']));
            if ($positive === []) { continue; }
            $items[] = ['id' => $candidate['id'], 'fact_ids' => [$positive[0]['id']],
                'reason' => '获准资料中有与已确认团队缺口对应的本次贡献依据。', 'gaps' => ['具体交付责任仍需要双方沟通。']];
        }
        return ['message' => $input['mode'] === 'discuss' ? '继续比较当前名单，可以先把已明确贡献和待确认责任分开。' : '这些候选通过已确认要求，建议围绕实际交付责任进一步沟通。', 'items' => $items];
    });
    $store = new InMemoryConversationStore();
    $make = static fn(): ConversationService => new ConversationService($ports->events, $ports->policies, $ports->queryValidator, $search,
        $ports->profiles, $ports->contacts, $ports->platform, $provider, $store, $ports->clock, new ConversationLimits(20, 40));
    return [$make(), $ports, $retriever, $wire, $store, $make, $provider];
}
function cviWireCheck(RecordingTransport $wire, string $label): array
{
    global $capturedBytes, $poolSizes;
    $responses = [];
    foreach ($wire->requests as $i => $request) {
        $bytes = strlen($wire->bodies[$i]); $capturedBytes[] = $bytes;
        cviCheck($bytes <= 24576, $label . ' full request including escaped content and both schemas fits 24KiB');
        cviCheck(count($request['messages']) === 2 && !isset($request['tools']), $label . ' adapter receives only bounded language input without tool execution');
        $input = json_decode($request['messages'][1]['content'], true, 32, JSON_THROW_ON_ERROR);
        if (!isset($input['candidates'])) { continue; }
        $responses[] = $input; $poolSizes[] = count($input['candidates']); $aliases = [];
        cviCheck(count($input['candidates']) <= ($input['mode'] === 'discuss' ? 5 : 24), $label . ' sent pool obeys mode-specific bound');
        foreach ($input['candidates'] as $candidate) {
            cviCheck(strlen(json_encode($candidate, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)) <= 768, $label . ' candidate summary stays within 768 bytes');
            foreach ($candidate['facts'] as $fact) { cviCheck(!isset($aliases[$fact['id']]), $label . ' fact alias is unique in transmitted request'); $aliases[$fact['id']] = true; }
        }
    }
    return $responses;
}

$workspaceRoot = dirname(__DIR__, 6);
$corpus = json_decode(file_get_contents($workspaceRoot . '/docs/推荐模块/examples/conversation-project-corpus_2026-11-12.json'), true, 64, JSON_THROW_ON_ERROR);
$users = $corpus['users'];
[$service, $ports, $retriever, $wire, $store, $restore, $provider] = cviBuild($users);
$view = $service->create(1, 7);
$view = $service->submit(1, $view['conversation_id'], $view['version'], '已有产品和前端，要两天内做出校园问答工具。我能组织测试，希望找愿意负责后端与资料处理的人。', 'wire-t1', 'recommend');
cviCheck($view['error'] === null && $view['items'] === [] && count($wire->requests) === 1 && count($retriever->calls) === 0, 'real provider accepts initial service envelope and returns clarification before search');
$runId = $view['current_run_id'];
$service = $restore(); $view = $service->get(1, $view['conversation_id']);
$view = $service->submit(1, $view['conversation_id'], $view['version'], '周日给同学实际试用。我确认后端贡献和周六14到18点联调是必需，教育领域经验仅是加分。', 'wire-t2', 'chat', cviHard());
cviCheck($view['error'] === null && count($view['items']) > 0 && count($view['items']) <= 5, 'confirmed constraints pass real search/rules and natural response adapter');
cviCheck($view['current_run_id'] === $runId && count($retriever->calls) === 1, 'clarification keeps one run and one actual search');
$firstIds = cviIds($view); $batchId = $view['current_batch']['batch_id'];
$beforeWire = count($wire->requests); $beforeVersion = $view['version'];
$view = $service->submit(1, $view['conversation_id'], $view['version'], '为什么第二位适合我们？先不找新人，和第一位比较一下。', 'wire-t3', 'chat');
cviCheck($view['error'] === null && cviIds($view) === $firstIds && $view['current_batch']['batch_id'] === $batchId, 'real discussion preserves current cards and display identity');
cviCheck(count($retriever->calls) === 1 && count($wire->requests) === $beforeWire + 1, 'discussion spends one provider call without another search');
$discussionInput = json_decode($wire->requests[count($wire->requests)-1]['messages'][1]['content'], true);
cviCheck($discussionInput['mode'] === 'discuss' && $discussionInput['display']['ordered_ids'] === $firstIds, 'second-person reference is bound to actual displayed batch');
$beforeWire = count($wire->requests);
$replay = $service->submit(1, $view['conversation_id'], $beforeVersion, '为什么第二位适合我们？先不找新人，和第一位比较一下。', 'wire-t3', 'chat');
cviCheck(count($wire->requests) === $beforeWire && cviIds($replay) === $firstIds, 'idempotent replay bypasses real gateway client');
$view = $service->submit(1, $view['conversation_id'], $view['version'], '保留刚才的必需条件，再推荐一些之前没看过的人。', 'wire-t4', 'refresh');
cviCheck($view['error'] === null && $view['current_run_id'] !== $runId && count($retriever->calls) === 2, 'explicit refresh opens another bounded run through actual provider');
cviCheck(array_intersect($firstIds, cviIds($view)) === [], 'refreshed list does not disguise already displayed people as new');
$responseInputs = cviWireCheck($wire, 'continuous dialogue');
cviCheck(count($ports->platform->reservations) === count($wire->requests), 'every actual wire request is paired with one platform attempt reservation');

// Build a larger fixed derived corpus before execution, preserving the original fixture on disk.
$rich = [];
for ($i = 0; $i < 40; $i++) {
    $u = $users[0]; $u['id'] = (string)(70001 + $i); $u['features']['topics'] = ['校园问答', '开发者工具', '知识检索'];
    $u['features']['offers'] = ['后端开发', '资料处理', 'API部署'];
    $u['features']['experience'] = ['独立部署过FastAPI接口', '给社团工具做过登录接口', '为项目整理过导入数据并编写校验脚本'];
    $u['features']['skills'] = ['Python', 'FastAPI', 'SQL', 'Docker', '数据导入校验']; $rich[] = $u;
}
$longNeed = '我们要把校园课程和社团活动资料变成能现场演示的问答工具，已有产品和前端，我负责访谈、协调测试和讲解，缺愿意负责后端接口与资料处理的队友。'
    . str_repeat('项目背景补充仅供理解：原型先覆盖课程和活动查询，大家协作完成演示，不推断候选已有教育经验。', 10);
[$service, $ports, $retriever, $wire] = cviBuild($rich);
$view = $service->create(1, 7);
$view = $service->submit(1, $view['conversation_id'], $view['version'], $longNeed, 'rich-t1', 'recommend');
cviCheck($view['error'] === null && count($retriever->calls) === 0, 'long project requirement remains a valid first clarification');
$answer = '周日现场演示。我确认后端贡献和周六14到18点联调为必需；领域经历只是偏好。'
    . str_repeat('分工背景补充：我们会提供整理后的问题样例和界面，不需要对方重复产品协调，希望双方先对接口边界达成一致。', 8);
$view = $service->submit(1, $view['conversation_id'], $view['version'], $answer, 'rich-t2', 'chat', cviHard());
cviCheck($view['error'] === null && count($view['items']) > 0, 'rich candidate pool and continued context produce a bounded real-provider response');
$richInputs = cviWireCheck($wire, 'rich pool with history');
$richResponse = array_values(array_filter($richInputs, static fn(array $i): bool => $i['mode'] === 'recommend'))[0];
cviCheck(count($richResponse['candidates']) < 24 && count($richResponse['candidates']) >= count($view['items']), 'host trims sorted candidate tail to fit context without provider-side hidden omission');
cviCheck($richResponse['requirements']['messages'] !== [] && $richResponse['history'] !== [], 'candidate trimming preserves continued requirement and history input');
$sentIds = array_column($richResponse['candidates'], 'id');
cviCheck(array_diff(cviIds($view), $sentIds) === [], 'every published candidate was actually transmitted');
foreach ($richResponse['requirements']['conditions'] as $condition) { if ($condition['strength'] === 'hard') { cviCheck($condition['origin'] === 'user_confirmed', 'candidate trimming retains confirmed hard conditions'); } }

// A compatible gateway is not trusted to enforce JSON schema: reference to an omitted person must fail.
$allRichIds = array_column($rich, 'id'); $omittedAttempted = [];
[$service, $ports, $retriever, $wire] = cviBuild($rich, true, static function (array $input) use ($allRichIds, &$omittedAttempted): ?array {
    if (($input['mode'] ?? null) !== 'recommend') { return null; }
    $missing = array_values(array_diff($allRichIds, array_column($input['candidates'], 'id')));
    if ($missing === []) { throw new RuntimeException('Test requires at least one actually omitted candidate.'); }
    $omittedAttempted[] = $missing[0];
    return ['message' => 'synthetic invalid candidate selection', 'items' => [['id' => $missing[0], 'fact_ids' => [$input['candidates'][0]['facts'][0]['id']], 'reason' => 'synthetic invalid cross-person evidence', 'gaps' => []]]];
});
$view = $service->create(1, 7);
$view = $service->submit(1, $view['conversation_id'], $view['version'], $longNeed, 'reject-t1', 'recommend');
$view = $service->submit(1, $view['conversation_id'], $view['version'], $answer, 'reject-t2', 'chat', cviHard());
cviCheck($omittedAttempted !== [] && $view['error'] !== null && $view['items'] === [], 'omitted candidate cannot be published even when gateway returns structurally valid JSON');
cviCheck(count($retriever->calls) === 1 && count($wire->requests) <= 5, 'invalid omitted-reference response never creates extra search or a sixth run call');
cviWireCheck($wire, 'rejected omitted candidate');

echo json_encode(['suite' => 'conversation_provider_integration', 'status' => 'passed', 'checks' => count($checks), 'network_calls' => 0,
    'transport' => 'synthetic_only', 'request_bytes' => $capturedBytes, 'sent_pool_sizes' => $poolSizes,
    'components' => ['ConversationService', 'SearchAiCandidates', 'DeterministicRuleEvaluator', 'ChatConversationProvider', 'ChatCompletionsClient']],
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR), PHP_EOL;
