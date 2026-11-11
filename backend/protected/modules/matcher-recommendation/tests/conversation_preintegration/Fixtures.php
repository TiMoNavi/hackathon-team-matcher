<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\tests\conversation_preintegration;

require_once dirname(__DIR__) . '/support/autoload.php';
require_once dirname(__DIR__) . '/ai_runs/Fixtures.php';
require_once dirname(__DIR__) . '/conversation_integration/Fixtures.php';

use humhub\modules\matcherRecommendation\adapters\conversation\InMemoryConversationStore;
use humhub\modules\matcherRecommendation\application\conversation\ConversationService;
use humhub\modules\matcherRecommendation\contracts\QueryIntent;
use humhub\modules\matcherRecommendation\contracts\ports\ConversationProvider;
use humhub\modules\matcherRecommendation\domain\conversation\ConversationLimits;
use humhub\modules\matcherRecommendation\tests\conversation_integration\{Fixtures as Corpus, CorpusRetriever};
use humhub\modules\matcherRecommendation\tests\rules\Fixtures as Rules;

/** Independent adversarial model: returns valid shapes but may omit user preferences. */
final class Provider implements ConversationProvider
{
    public array $calls = [];
    public array $plans = [];
    public string $mode = 'selected';
    public bool $failPlan = false;
    public ?string $mentionedId = null;
    public ?string $mentionedText = null;

    public static function draft(): array
    {
        return ['action' => 'search', 'message' => '按本次后端贡献检索。', 'conditions' => [
            ['feature' => 'needs', 'operator' => 'supply_demand', 'value' => ['后端开发'], 'strength' => 'soft', 'origin' => 'interpreted_draft'],
        ]];
    }
    public function plan(array $input, string $permit): array
    {
        $this->calls[] = ['stage' => 'plan', 'input' => $input];
        if ($this->failPlan) { throw new \humhub\modules\matcherRecommendation\domain\ai\AiRecommendationException('provider_unavailable'); }
        return $this->plans === [] ? self::draft() : array_shift($this->plans);
    }
    public function respond(array $input, string $permit): array
    {
        $this->calls[] = ['stage' => 'respond', 'input' => $input];
        $candidate = $input['candidates'][0];
        $fact = current(array_filter($candidate['facts'], static fn(array $f): bool => $f['positive']));
        $items = [['id' => $candidate['id'], 'fact_ids' => [$fact['id']], 'reason' => '本次有明确的后端贡献意愿。', 'gaps' => ['实际交付经历还需沟通。']]];
        $message = '继续按本次已获准事实讨论。';
        if ($input['mode'] === 'recommend' && $this->mode !== 'selected') {
            $mentioned = in_array($this->mode, ['empty', 'selected_body'], true) ? $candidate : $input['candidates'][1];
            $this->mentionedId = $mentioned['id'];
            $this->mentionedText = '审计事实-' . $mentioned['id'] . '：' . $mentioned['facts'][0]['text'];
            $message = '也看过另一条资料，' . $this->mentionedText . '。交付经验仍需确认。';
            if ($this->mode === 'empty') { $items = []; }
        }
        return ['message' => $message, 'items' => $items];
    }
}

final class Harness
{
    public readonly object $ports;
    public readonly CorpusRetriever $retriever;
    public readonly Provider $provider;
    public readonly InMemoryConversationStore $store;
    private readonly object $search;

    public function __construct(int $syntheticCount = 0)
    {
        $workspaceRoot = dirname(__DIR__, 6);
        $users = json_decode(file_get_contents($workspaceRoot . '/docs/推荐模块/examples/conversation-project-corpus_2026-11-12.json'), true, 64, JSON_THROW_ON_ERROR)['users'];
        if ($syntheticCount > 0) {
            $sample = $users[0]; $users = [];
            for ($i = 0; $i < $syntheticCount; $i++) { $copy = $sample; $copy['id'] = (string)(80001 + $i); $users[] = $copy; }
        }
        $this->ports = Corpus::ports($users);
        $this->ports->platform->remaining = 80;
        $this->retriever = new CorpusRetriever($this->ports, $users);
        $this->search = Corpus::search($this->ports, $this->retriever);
        $this->provider = new Provider();
        $this->store = new InMemoryConversationStore();
    }
    public function service(): ConversationService
    {
        $p = $this->ports;
        return new ConversationService($p->events, $p->policies, $p->queryValidator, $this->search, $p->profiles, $p->contacts,
            $p->platform, $this->provider, $this->store, $p->clock, new ConversationLimits(20, 40));
    }
    public function start(?QueryIntent $confirmed = null, string $message = '先看愿意做后端的人。'): array
    {
        $s = $this->service(); $v = $s->create(1, 7);
        return $s->submit(1, $v['conversation_id'], $v['version'], $message, 'initial', 'recommend', $confirmed);
    }
    public static function confirmed(string $topic = '教育工具'): QueryIntent
    {
        return new QueryIntent('person', [Rules::condition('needs', 'supply_demand', ['后端开发'], 'hard'),
            Rules::condition('topics', 'similarity', [$topic], 'soft')]);
    }
    public static function hardTime(): QueryIntent
    {
        return new QueryIntent('person', [Rules::condition('needs', 'supply_demand', ['后端开发'], 'hard'),
            Rules::condition('availability', 'interval_overlap', [['starts_at' => '2026-11-14T14:00:00+08:00', 'ends_at' => '2026-11-14T18:00:00+08:00']], 'hard')]);
    }
    public static function legacy(string $case): array
    {
        $record = json_decode(file_get_contents(__DIR__ . '/legacy_snapshots.json'), true, 64, JSON_THROW_ON_ERROR);
        if ($record['source_sha256'] !== 'f626d8105a14254abbd81053e15fc11b0edb1442242324586677bab2e4ed94d9') { throw new \RuntimeException('Legacy fixture is not from the audited pre-fix source.'); }
        $fixture = $record['cases'][$case]; $state = $fixture['snapshot']; $state['version'] = 1;
        $h = new self(); $h->store->create($state['id'], $state['owner_id'], $state['event_id'], $state);
        return [$h, ['conversation_id' => $state['id'], 'version' => 1], $fixture];
    }
    public static function contains(array $conditions, string $feature, array $value, string $strength, string $origin = 'user_confirmed'): bool
    {
        return count(array_filter($conditions, static fn(array $c): bool => $c['feature'] === $feature && $c['value'] === $value && $c['strength'] === $strength && $c['origin'] === $origin)) === 1;
    }
    public function patch(array $view, callable $change): void
    {
        $state = $this->store->load($view['conversation_id'], 1); $version = $state['version'];
        $change($state); $state['version']++;
        if (!$this->store->compareAndSwap($view['conversation_id'], 1, $version, $state)) { throw new \RuntimeException('Test snapshot CAS failed.'); }
    }
}
