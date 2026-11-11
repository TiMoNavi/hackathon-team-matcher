<?php
declare(strict_types=1);
/** S7.7 integration of production validator/engine with an in-memory transport only. */
$modules = dirname(__DIR__, 2);
spl_autoload_register(static function (string $class) use ($modules): void {
    foreach (['matcherProfile' => 'matcher-user-profile', 'matcherOnboardingAi' => 'matcher-onboarding-ai'] as $ns => $module) {
        $prefix = 'humhub\\modules\\' . $ns . '\\';
        if (str_starts_with($class, $prefix)) { $file = $modules . '/' . $module . '/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php'; if (is_file($file)) { require_once $file; } }
    }
});
use humhub\modules\matcherOnboardingAi\application\StructuredProfileAiEngine;
use humhub\modules\matcherOnboardingAi\domain\GatewayConfig;
use humhub\modules\matcherOnboardingAi\domain\OutputValidator;
use humhub\modules\matcherOnboardingAi\domain\TransportFailure;
use humhub\modules\matcherOnboardingAi\domain\ports\ModelTransport;
use humhub\modules\matcherProfile\domain\ProfileAiFailure;
use humhub\modules\matcherProfile\domain\rules\RuleQuestionProvider;
final class S77OfflineTransport implements ModelTransport {
    public int $calls = 0;
    public function __construct(private $reply) {}
    public function available(): bool { return true; }
    public function request(GatewayConfig $config, array $payload): array { ++$this->calls; return ($this->reply)($payload); }
}
function s77Envelope(array $data, ?array $usage = null): array {
    return ['status' => 200, 'body' => json_encode(['model' => 's77-offline', 'choices' => [['finish_reason' => 'stop', 'message' => ['role' => 'assistant', 'content' => json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE)]]], 'usage' => $usage], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE)];
}
$checks = [];
function s77Check(string $name, bool $ok): void { global $checks; $checks[$name] = $ok; if (!$ok) { throw new RuntimeException($name); } }
try {
    $cfg = new GatewayConfig('https://s77-offline.invalid/v1', 's77-offline', 'synthetic-not-live');
    $source = ['space_id' => 77, 'sources' => [['source_id' => 's77_source', 'version' => 1, 'sections' => [['id' => 's77_section', 'text' => '城市：杭州。技能：Python。']]]]];
    $ex = ['candidates' => [['id' => 's77_city', 'key' => 'city', 'value' => '杭州', 'evidence' => [['source_id' => 's77_source', 'source_version' => 1, 'section_id' => 's77_section']]]], 'review_items' => []];
    $profiles = ['global' => ['attributes' => [['attribute_id' => 'private_skill', 'key' => 'skill', 'value' => ['code' => 'python', 'label' => 'Python'], 'visibility' => 'private']]], 'space' => ['attributes' => []]];
    $qin = ['profiles' => $profiles, 'space_id' => 77];
    $questions = (new RuleQuestionProvider())->questions($profiles, 77);
    $answers = array_map(static fn(array $q): array => ['question_id' => $q['id'], 'answer_type' => 'skipped', 'selected_options' => [], 'free_text' => ''], $questions);
    $cin = $qin + ['questions' => $questions, 'answers' => $answers];
    $compose = ['global_fields' => [['key' => 'headline', 'value' => '我使用 Python 完成合成项目。', 'visibility' => 'authenticated', 'evidence' => [['type' => 'profile', 'scope' => 'global', 'attribute_id' => 'private_skill']]]], 'space_fields' => [], 'review_items' => []];
    $cases = ['extract' => [$source, $ex], 'questions' => [$qin, ['questions' => $questions, 'review_items' => []]], 'compose' => [$cin, $compose]];
    foreach ($cases as $op => [$input, $output]) {
        $transport = new S77OfflineTransport(static fn() => s77Envelope($output, ['prompt_tokens' => 11, 'completion_tokens' => 7, 'total_tokens' => 18]));
        $engine = new StructuredProfileAiEngine($cfg, $transport);
        $engine->status(); $engine->status();
        s77Check($op . '_capability_is_read_only', $transport->calls === 0);
        $result = $engine->generate($op, $input);
        s77Check($op . '_single_transport_call', $transport->calls === 1 && $result['metrics']['llm_calls'] === 1);
        s77Check($op . '_actual_usage', $result['metrics']['usage'] === ['prompt_tokens' => 11, 'completion_tokens' => 7, 'total_tokens' => 18, 'reported' => true]);
        s77Check($op . '_review_items_list', array_is_list($result['data']['review_items']));
        if ($op === 'compose') {
            s77Check('compose_inherits_private_evidence', $result['data']['global_fields'][0]['visibility'] === 'private');
            s77Check('compose_appends_prose_review', $result['data']['review_items'][0]['id'] === 'server-prose-review');
        }
        if ($op === 'questions') {
            s77Check('questions_server_free_entry_last', array_reduce($result['data']['questions'], static fn(bool $ok, array $q): bool => $ok && $q['free_text_option'] === OutputValidator::FREE_TEXT_OPTION, true));
        }
        $invalid = $output + ['confirm_and_publish' => true];
        $bad = new S77OfflineTransport(static fn() => s77Envelope($invalid, ['prompt_tokens' => 11, 'completion_tokens' => 7, 'total_tokens' => 18]));
        try { (new StructuredProfileAiEngine($cfg, $bad))->generate($op, $input); throw new RuntimeException('Invalid schema accepted.'); }
        catch (ProfileAiFailure $e) {
            s77Check($op . '_schema_failure_no_retry', $e->errorCode === 'AI_OUTPUT_INVALID' && $bad->calls === 1 && $e->metrics['llm_calls'] === 1);
            s77Check($op . '_schema_failure_preserves_usage', $e->metrics['usage']['total_tokens'] === 18);
            s77Check($op . '_exception_contains_no_body', $e->getPrevious() === null && !str_contains($e->getMessage(), 'confirm_and_publish'));
        }
        $timeout = new S77OfflineTransport(static function (): never { throw new TransportFailure('AI_TIMEOUT'); });
        try { (new StructuredProfileAiEngine($cfg, $timeout))->generate($op, $input); throw new RuntimeException('Timeout accepted.'); }
        catch (ProfileAiFailure $e) {
            s77Check($op . '_timeout_exactly_one_attempt', $e->errorCode === 'AI_TIMEOUT' && $timeout->calls === 1 && $e->metrics['llm_calls'] === 1);
            s77Check($op . '_timeout_usage_unknown', $e->metrics['usage'] === ['prompt_tokens' => null, 'completion_tokens' => null, 'total_tokens' => null, 'reported' => false]);
        }
        $noUsage = new S77OfflineTransport(static fn() => s77Envelope($output));
        $unknown = (new StructuredProfileAiEngine($cfg, $noUsage))->generate($op, $input);
        s77Check($op . '_missing_usage_remains_unknown', $unknown['metrics']['usage']['reported'] === false && $unknown['metrics']['usage']['total_tokens'] === null);
    }
    $disabled = new S77OfflineTransport(static fn() => s77Envelope($ex));
    try { (new StructuredProfileAiEngine(null, $disabled))->generate('extract', $source); throw new RuntimeException('Disabled engine accepted.'); }
    catch (ProfileAiFailure $e) { s77Check('disabled_engine_zero_calls_no_fallback', $e->errorCode === 'AI_NOT_CONFIGURED' && $disabled->calls === 0 && $e->metrics['llm_calls'] === 0); }
    echo json_encode(['suite' => 's77-engine-offline', 'status' => 'passed', 'passed' => count($checks), 'checks' => $checks, 'real_gateway_calls' => 0, 'production_code_changes' => 0], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR), PHP_EOL;
} catch (Throwable $error) {
    echo json_encode(['suite' => 's77-engine-offline', 'status' => 'failed', 'checks' => $checks, 'error_type' => get_class($error), 'line' => $error->getLine(), 'real_gateway_calls' => 0], JSON_THROW_ON_ERROR), PHP_EOL; exit(1);
}
