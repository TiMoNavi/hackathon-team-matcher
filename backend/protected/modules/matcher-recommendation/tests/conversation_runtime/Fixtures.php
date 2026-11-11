<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\tests\conversation_runtime;
require_once dirname(__DIR__) . '/support/autoload.php';
require_once dirname(__DIR__) . '/ai_runs/Fixtures.php';
use humhub\modules\matcherRecommendation\contracts\ports\ConversationProvider;
use humhub\modules\matcherRecommendation\tests\ai_runs\Fixtures as F;
use humhub\modules\matcherRecommendation\application\conversation\ConversationService;
use humhub\modules\matcherRecommendation\adapters\conversation\{ConversationRuntimeSchema, ConversationStorageSchema, PdoConversationStore, PdoConversationRuntime, PdoRecommendationBudget};
use humhub\modules\matcherRecommendation\domain\conversation\ConversationLimits;

final class Provider implements ConversationProvider
{
    public int $calls = 0; public ?\Closure $onCall = null;
    public function plan(array $input, string $permit): array
    { $this->calls++; if ($this->onCall !== null) { ($this->onCall)(); } return ['action' => 'search', 'message' => '按共同主题查找。', 'conditions' => F::ready()['conditions']]; }
    public function respond(array $input, string $permit): array
    {
        $this->calls++; if ($this->onCall !== null) { ($this->onCall)(); }
        $c = $input['candidates'][0]; $fact = current(array_filter($c['facts'], static fn(array $f): bool => $f['positive']));
        return ['message' => '这位有共同主题，具体合作仍需沟通。', 'items' => [['id' => $c['id'], 'fact_ids' => [$fact['id']], 'reason' => '已确认共同主题。', 'gaps' => ['需要确认分工。']]]];
    }
}
final class Harness
{
    public readonly F $ports; public readonly Provider $provider; public readonly PdoConversationRuntime $runtime;
    public readonly PdoConversationStore $store; public readonly PdoRecommendationBudget $budget; public readonly string $identity;
    public function __construct(public readonly \PDO $db)
    {
        ConversationStorageSchema::install($db); ConversationRuntimeSchema::install($db);
        $this->ports = F::create(); $this->ports->platform->remaining = 100; $this->provider = new Provider();
        $this->runtime = new PdoConversationRuntime($db); $this->runtime->configure(1, true, 'synthetic-provider', 'reviewed-v1');
        $this->identity = $this->runtime->identity(); $this->store = new PdoConversationStore($db);
        $this->budget = new PdoRecommendationBudget($db, $this->ports->platform, $this->runtime, $this->identity, $this->ports->clock);
        $this->budget->configureAllowance(1, 100);
    }
    public function service(): ConversationService
    {
        $f = $this->ports;
        return new ConversationService($f->events, $f->policies, $f->queryValidator, $f->search, $f->profiles, $f->contacts,
            $this->budget, $this->provider, $this->store, $f->clock, new ConversationLimits(20, 40), $this->identity, $this->runtime);
    }
}
