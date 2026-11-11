<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\application;

use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\ports\QuestionRepository;
use humhub\modules\matcherProfile\domain\ports\ProfileWorkflow;
use humhub\modules\matcherProfile\domain\ports\QuestionProvider;
use humhub\modules\matcherProfile\domain\ports\ProfileComposer;
use humhub\modules\matcherProfile\domain\rules\RuleQuestionProvider;
use humhub\modules\matcherProfile\domain\rules\RulesProfileComposer;

final class QuestionService
{
    private readonly \Closure $clock;
    private readonly QuestionProvider $provider;
    private readonly ProfileComposer $composer;
    public function __construct(private readonly QuestionRepository $repository, private readonly ProfileWorkflow $workflow, ?callable $clock = null, ?QuestionProvider $provider = null, ?ProfileComposer $composer = null)
    { $this->clock = $clock === null ? static fn(): string => gmdate('Y-m-d H:i:s') : \Closure::fromCallable($clock); $this->provider = $provider ?? new RuleQuestionProvider(); $this->composer = $composer ?? new RulesProfileComposer(); }

    public function prepare(int $ownerId, ?int $spaceId, array $profileVersions): array
    {
        return $this->workflow->transaction($ownerId, $spaceId, function () use ($ownerId, $spaceId, $profileVersions): array {
            return $this->repository->transaction(function () use ($ownerId, $spaceId, $profileVersions): array {
                $profiles = $this->workflow->profiles($ownerId, $spaceId);
                $this->expectProfiles($profiles, $profileVersions);
                $now = ($this->clock)();
                $batch = ['id' => self::uuid(), 'owner_id' => $ownerId, 'space_id' => $spaceId, 'profile_versions' => self::versions($profiles), 'version' => 1, 'questions' => $this->provider->questions($profiles, $spaceId), 'generation_mode' => 'rules', 'schema_version' => 1, 'policy_version' => RuleQuestionProvider::VERSION, 'created_at' => $now, 'updated_at' => $now];
                $this->repository->saveBatch($batch);
                return $this->result($batch);
            });
        });
    }
    public function get(int $ownerId, string $id): array
    {
        $known = $this->owned($ownerId, $id);
        return $this->workflow->transaction($ownerId, $known['space_id'], fn(): array => $this->result($this->owned($ownerId, $id, true)), false);
    }
    /**
     * Owner-only historical counts, including completed AI batches whose former
     * profile inputs no longer match. This never returns stale questions or values.
     */
    public function getProgressCounts(int $ownerId, string $batchId, int $questionIndex = 0): array
    {
        $known = $this->repository->findBatch($batchId);
        if ($known === null || (int)$known['owner_id'] !== $ownerId) {
            throw new ProfileException('QUESTION_BATCH_NOT_FOUND', 'The question batch was not found.', 404);
        }
        return $this->workflow->transaction($ownerId, $known['space_id'], function () use ($ownerId, $batchId, $questionIndex, $known): array {
            $batch = $this->repository->findBatch($batchId, true);
            if ($batch === null || (int)$batch['owner_id'] !== $ownerId || $batch['space_id'] !== $known['space_id']) {
                throw new ProfileException('QUESTION_BATCH_NOT_FOUND', 'The question batch was not found.', 404);
            }
            $answers = array_column($this->repository->answers($batchId), null, 'question_id');
            $total = count($batch['questions']); $answered = 0; $skipped = 0;
            foreach ($batch['questions'] as $question) {
                $type = $answers[$question['id']]['answer_type'] ?? null;
                if ($type === 'skipped') { ++$skipped; }
                elseif (in_array($type, ['options', 'free_text'], true)) { ++$answered; }
            }
            return ['questions' => ['total' => $total, 'answered' => $answered, 'skipped' => $skipped,
                'remaining' => $total - $answered - $skipped, 'current_index' => $total === 0 ? null : min(max(0, $questionIndex), $total - 1)],
                'batch_version' => (int)$batch['version']];
        }, false);
    }
    public function answer(int $ownerId, string $batchId, string $questionId, int $expectedVersion, array $payload): array
    {
        $known = $this->owned($ownerId, $batchId);
        return $this->workflow->transaction($ownerId, $known['space_id'], function () use ($ownerId, $batchId, $questionId, $expectedVersion, $payload): array {
            return $this->repository->transaction(function () use ($ownerId, $batchId, $questionId, $expectedVersion, $payload): array {
                $batch = $this->owned($ownerId, $batchId, true);
                $question = array_column($batch['questions'], null, 'id')[$questionId] ?? null;
                if ($question === null) { throw new ProfileException('QUESTION_NOT_FOUND', 'This question is not in the saved batch.', 404); }
                $normalized = $this->normalizeAnswer($question, $payload);
                $prior = $this->repository->findAnswer($batchId, $questionId, true);
                if ($expectedVersion < 0 || (int)($prior['version'] ?? 0) !== $expectedVersion) { throw new ProfileException('ANSWER_VERSION_CONFLICT', 'This answer has changed. Reload before saving.', 409); }
                if ($prior !== null && $prior['answer_type'] === $normalized['answer_type'] && $prior['selected_options'] === $normalized['selected_options'] && $prior['free_text'] === $normalized['free_text']) { return $this->result($batch); }
                $now = ($this->clock)();
                $answer = array_merge($normalized, ['id' => $prior['id'] ?? self::uuid(), 'batch_id' => $batchId, 'question_id' => $questionId, 'version' => $expectedVersion + 1, 'created_at' => $prior['created_at'] ?? $now, 'updated_at' => $now]);
                $this->repository->saveAnswer($answer);
                ++$batch['version']; $batch['updated_at'] = $now; $this->repository->saveBatch($batch);
                return $this->result($batch);
            });
        });
    }
    public function compose(int $ownerId, string $id, int $expectedBatchVersion): array
    {
        $known = $this->owned($ownerId, $id);
        return $this->workflow->transaction($ownerId, $known['space_id'], function () use ($ownerId, $id, $expectedBatchVersion): array {
            $batch = $this->owned($ownerId, $id, true);
            if ($batch['version'] !== $expectedBatchVersion) { throw new ProfileException('BATCH_VERSION_CONFLICT', 'Answers changed. Reload before preparing the profile.', 409); }
            $profiles = $this->workflow->profiles($ownerId, $batch['space_id']); $this->expectProfiles($profiles, $batch['profile_versions']);
            $result = $this->composer->compose($profiles, $batch['questions'], $this->repository->answers($id));
            return $result + ['profile_versions' => $batch['profile_versions'], 'batch_version' => $batch['version']];
        });
    }
    public static function aiProfileHash(array $profiles): string
    {
        $values=array_map(static fn($p)=>$p===null?null:['revision'=>$p['revision'],'permission_version'=>$p['permission_version'],'attributes'=>$p['attributes']],$profiles);
        $normalize=function($v)use(&$normalize){if(is_array($v)){if(!array_is_list($v))ksort($v);foreach($v as &$item)$item=$normalize($item);unset($item);}return $v;};
        return hash('sha256',json_encode($normalize($values),JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE));
    }
    public static function versions(array $profiles): array
    { return ['global' => (int)$profiles['global']['revision'], 'space' => $profiles['space'] === null ? null : (int)$profiles['space']['revision']]; }
    public static function sameVersions(array $left, array $right): bool
    {
        $keys = ['global', 'space'];
        return count($left) === 2 && count($right) === 2 && array_diff($keys, array_keys($left)) === [] && array_diff($keys, array_keys($right)) === [] && $left['global'] === $right['global'] && $left['space'] === $right['space'];
    }
    private function expectProfiles(array $profiles, array $versions): void
    {
        if (!self::sameVersions(self::versions($profiles), $versions)) { throw new ProfileException('PROFILE_VERSION_CONFLICT', 'The confirmed profile changed. Review the latest information first.', 409, ['current_versions' => self::versions($profiles)]); }
    }
    private function owned(int $ownerId, string $id, bool $lock = false): array
    {
        $batch = $this->repository->findBatch($id, $lock);
        if ($batch === null || (int)$batch['owner_id'] !== $ownerId) { throw new ProfileException('QUESTION_BATCH_NOT_FOUND', 'The question batch was not found.', 404); }
        if($batch['generation_mode']==='ai'&&!hash_equals($batch['policy_version'],self::aiProfileHash($this->workflow->profiles($ownerId,$batch['space_id']))))throw new ProfileException('AI_RESULT_NOT_APPLICABLE','The AI question batch no longer matches the confirmed profile or its visibility. Reconcile before continuing.',409);
        return $batch;
    }
    private function result(array $batch): array
    { return $batch + ['answers' => $this->repository->answers($batch['id']), 'llm_calls' => (int)($batch['ai_metadata']['metrics']['llm_calls']??0), 'review_items'=>$batch['ai_metadata']['review_items']??[]]; }
    private function normalizeAnswer(array $question, array $payload): array
    {
        if (array_diff(array_keys($payload), ['answer_type', 'selected_options', 'free_text']) !== []) { $this->invalid('Unsupported answer fields.'); }
        $type = $payload['answer_type'] ?? null; $codes = $payload['selected_options'] ?? []; $text = $payload['free_text'] ?? '';
        if (!in_array($type, ['options', 'free_text', 'skipped'], true) || !is_array($codes) || !array_is_list($codes) || !is_string($text) || mb_strlen($text, 'UTF-8') > 1000 || !mb_check_encoding($text, 'UTF-8')) { $this->invalid('Provide a supported answer and at most 1000 characters.'); }
        $text = trim($text);
        if (count($codes) > 5 || count(array_filter($codes, 'is_string')) !== count($codes) || count(array_unique($codes)) !== count($codes) || array_diff($codes, array_column($question['options'], 'code')) !== []) { $this->invalid('Choose only distinct options from the saved question.'); }
        if ($question['mode'] === 'single' && count($codes) > 1) { $this->invalid('This question allows one option.'); }
        if ($type === 'options' && $codes === []) { $this->invalid('Choose an option or use a free answer.'); }
        if ($type === 'free_text' && ($text === '' || $codes !== [])) { $this->invalid('A free answer needs text and no selected options.'); }
        if ($type === 'skipped' && ($text !== '' || $codes !== [])) { $this->invalid('A skipped answer contains no value.'); }
        if ($question['target_key'] === 'seeking' && $type !== 'skipped') {
            $labels = array_column($question['options'], 'label', 'code');
            $combined = implode('；', array_filter([implode('、', array_map(static fn(string $code): string => $labels[$code], $codes)), $text]));
            if (mb_strlen($combined, 'UTF-8') > 1000) { $this->invalid('The selected expectations and explanation together may contain at most 1000 characters.'); }
        }
        return ['answer_type' => $type, 'selected_options' => $codes, 'free_text' => $text];
    }
    private function invalid(string $message): never { throw new ProfileException('ANSWER_VALIDATION_FAILED', $message); }
    public static function uuid(): string
    { $hex = bin2hex(random_bytes(16)); return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-4' . substr($hex, 13, 3) . '-8' . substr($hex, 17, 3) . '-' . substr($hex, 20); }
}
