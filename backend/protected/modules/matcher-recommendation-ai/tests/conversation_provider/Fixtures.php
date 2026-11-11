<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendationAi\tests\conversation_provider;
use humhub\modules\matcherRecommendationAi\adapters\gateway\{ChatCompletionsClient, GatewayConfig, GatewayResponse, GatewayTransport};
use humhub\modules\matcherRecommendationAi\adapters\conversation\ChatConversationProvider;

/** All profiles, transcripts and credentials in this fixture are synthetic. No network transport exists here. */
final class RecordingTransport implements GatewayTransport
{
    public array $requests = [];
    public array $bodies = [];
    public mixed $reply = null;
    public int $status = 200;
    public string $finish = 'stop';
    public function post(GatewayConfig $config, string $json): GatewayResponse
    {
        $this->bodies[] = $json; $request = json_decode($json, true, 32, JSON_THROW_ON_ERROR); $this->requests[] = $request;
        $value = $this->reply instanceof \Closure ? ($this->reply)($request) : $this->reply;
        return new GatewayResponse($this->status, json_encode(['choices' => [['index' => 0, 'finish_reason' => $this->finish,
            'message' => ['role' => 'assistant', 'content' => json_encode($value, JSON_THROW_ON_ERROR)]]],
            'usage' => ['prompt_tokens' => 321, 'completion_tokens' => 123, 'total_tokens' => 444]], JSON_THROW_ON_ERROR));
    }
}

final class Fixtures
{
    public static function build(mixed $reply = null): array
    {
        $transport = new RecordingTransport(); $transport->reply = $reply ?? self::clarify();
        $client = new ChatCompletionsClient(new GatewayConfig('https://conversation.synthetic.invalid/v1', 'synthetic-model', 'SYNTHETIC_NOT_A_CREDENTIAL', 4096), $transport);
        return [new ChatConversationProvider($client), $transport];
    }
    public static function condition(string $feature = 'needs', string $operator = 'supply_demand', mixed $value = ['backend']): array
    { return ['feature' => $feature, 'operator' => $operator, 'value' => $value, 'strength' => 'soft', 'origin' => 'interpreted_draft']; }
    public static function planInput(): array
    {
        return ['schema_version' => 'conversation-v1', 'message' => '我们已有产品和前端，两天内要做校园问答演示，我负责组织测试，缺后端和资料处理。希望队友愿意一起交付。',
            'history' => [], 'requirements' => ['messages' => [], 'conditions' => []], 'field_catalog' => [
                ['feature' => 'needs', 'operator' => 'supply_demand', 'value_type' => 'token_set', 'allowed_values' => null, 'description' => '候选本次活动明确愿意承担的工作，用户自己的贡献不是对方需求。',
                    'candidate_features' => ['offers'], 'scope' => 'event', 'subject' => 'candidate_requirement', 'semantic' => 'declared_contribution', 'value_schema' => ['type' => 'array', 'items' => ['type' => 'string']]],
                ['feature' => 'skills', 'operator' => 'coverage_gain', 'value_type' => 'token_set', 'allowed_values' => null, 'description' => '候选确认的技能，不代表曾独立交付项目或愿意承担。',
                    'candidate_features' => ['skills'], 'scope' => 'global', 'subject' => 'candidate_requirement'],
                ['feature' => 'self_type', 'operator' => 'explicit_preference', 'value_type' => 'enum', 'allowed_values' => ['leader', 'builder', 'explorer'], 'description' => '候选自述工作类型，不能由产品岗位推断。',
                    'candidate_features' => ['self_type'], 'scope' => 'global', 'subject' => 'candidate_requirement'],
                ['feature' => 'availability', 'operator' => 'interval_overlap', 'value_type' => 'intervals', 'allowed_values' => null, 'description' => '明确可投入时段，不猜空闲。',
                    'candidate_features' => ['availability'], 'scope' => 'event', 'subject' => 'candidate_requirement'],
            ], 'allowed_actions' => ['clarify', 'search', 'discuss']];
    }
    public static function clarify(): array
    { return ['action' => 'clarify', 'message' => '你们两天后更希望做到现场演示，还是能让同学实际试用？这会影响我优先考虑接口部署还是问答实验经验。', 'conditions' => []]; }
    public static function ready(): array
    { return ['action' => 'search', 'message' => '我会优先考虑愿意承担后端交付的人，再看资料处理经验。教育行业经验暂时作为加分项。', 'conditions' => [self::condition()]]; }
    public static function candidate(string $id = '11', int $start = 1): array
    {
        return ['id' => $id, 'rule_score' => 0.72, 'facts' => [
            ['id' => 'f' . $start, 'feature' => 'offers', 'text' => '本次活动愿意承担后端接口和部署。', 'positive' => true],
            ['id' => 'f' . ($start + 1), 'feature' => 'skills', 'text' => '做过库存查询接口的开发和演示部署。', 'positive' => true],
        ], 'unknown_features' => ['education_experience'], 'omitted_fact_count' => 0];
    }
    public static function responseInput(string $mode = 'recommend'): array
    {
        return ['schema_version' => 'conversation-v1', 'mode' => $mode, 'message' => $mode === 'recommend' ? '先找能承担后端的人，教育经验只是加分。' : '为什么推荐第二位？先别找新人。',
            'history' => [['role' => 'user', 'message' => '我们有产品和前端，需要两天内做能演示的校园问答。'], ['role' => 'assistant', 'message' => '交付目标已经明确，可以按这个方向比较。']],
            'requirements' => ['messages' => ['我负责产品测试，缺后端交付。'], 'conditions' => [self::condition()]],
            'candidates' => [self::candidate(), self::candidate('12', 3)],
            'display' => ['batch_id' => $mode === 'recommend' ? null : 'batch-1', 'ordered_ids' => $mode === 'recommend' ? [] : ['11', '12']]];
    }
    public static function answer(): array
    { return ['message' => '这位可以补后端交付的缺口，不过教育场景经验仍需沟通确认。', 'items' => [
        ['id' => '11', 'fact_ids' => ['f1', 'f2'], 'reason' => '他明确愿意承担后端，也有接口和演示部署经历，与你们两天做出可演示版本的目标相关。', 'gaps' => ['资料没有说明教育领域经验。']],
    ]]; }
}
