<?php
declare(strict_types=1);
namespace humhub\modules\matcherOnboarding\application;

use humhub\modules\matcherOnboarding\domain\ports\OnboardingRepository;
use humhub\modules\matcherOnboarding\domain\SessionProgress;
use humhub\modules\matcherProfile\domain\ports\ProfileWorkflow;
use humhub\modules\matcherProfile\application\QuestionService;
use humhub\modules\matcherProfile\domain\ProfileException;

/** Owner-only progress. Stored records contain references, never a second copy of profile values. */
final class OnboardingService
{
    public const STAGES = ['materials', 'review', 'questions', 'draft', 'privacy'];
    private readonly \Closure $clock;
    private readonly ?\Closure $taskProgress;
    private readonly ?\Closure $completedQuestionProgress;
    /** Optional owner/session task reader; it never resolves a model engine. */
    public function __construct(private readonly OnboardingRepository $repository, private readonly ProfileWorkflow $workflow, private readonly QuestionService $questions, ?callable $clock = null, ?callable $taskProgress = null, ?callable $completedQuestionProgress = null)
    {
        $this->clock = $clock === null ? static fn(): string => gmdate('Y-m-d H:i:s') : \Closure::fromCallable($clock);
        $this->taskProgress = $taskProgress === null ? null : \Closure::fromCallable($taskProgress);
        $this->completedQuestionProgress = $completedQuestionProgress === null ? null : \Closure::fromCallable($completedQuestionProgress);
    }

    public function start(int $ownerId, ?int $spaceId): array
    {
        return $this->workflow->transaction($ownerId, $spaceId, function () use ($ownerId, $spaceId): array {
            return $this->repository->transaction(function () use ($ownerId, $spaceId): array {
                $scope = $spaceId === null ? 'global' : 'space:' . $spaceId;
                $existing = $this->repository->findActive($ownerId, $scope, true);
                if ($existing !== null) { return $this->result($existing); }
                $now = ($this->clock)();
                $session = ['id' => QuestionService::uuid(), 'owner_id' => $ownerId, 'scope_key' => $scope, 'space_id' => $spaceId, 'version' => 1, 'stage' => 'materials', 'max_stage' => 'materials', 'status' => 'active', 'resource_refs' => ['input_drafts' => $this->newDrafts($ownerId, $spaceId), 'output_drafts' => ['global' => null, 'space' => null], 'profile_versions' => QuestionService::versions($this->workflow->profiles($ownerId, $spaceId)), 'question_batch_id' => null, 'synthesis_batch_version' => null, 'question_index' => 0, 'review_confirmed' => false, 'history' => []], 'created_at' => $now, 'updated_at' => $now, 'completed_at' => null];
                $this->repository->saveSession($session);
                return $this->result($session);
            });
        });
    }
    public function get(int $ownerId, string $id): array
    {
        $known = $this->owned($ownerId, $id);
        return $this->workflow->transaction($ownerId, $known['space_id'], fn(): array => $this->result($this->owned($ownerId, $id, true)), false);
    }
    /** Uses exactly the same owner/Space checks and projection as every SessionDTO. */
    public function getProgress(int $ownerId, string $id): array
    { return $this->get($ownerId, $id)['progress']; }
    public function update(int $ownerId, string $id, int $expectedVersion, array $payload): array
    {
        $known = $this->owned($ownerId, $id);
        return $this->workflow->transaction($ownerId, $known['space_id'], function () use ($ownerId, $id, $expectedVersion, $payload): array {
            return $this->repository->transaction(function () use ($ownerId, $id, $expectedVersion, $payload): array {
                $session = $this->owned($ownerId, $id, true); $action = $payload['action'] ?? '';
                $hash = hash('sha256', json_encode([$expectedVersion, $payload], JSON_THROW_ON_ERROR));
                if ($action === 'complete' && $session['status'] === 'completed' && ($session['resource_refs']['completion_request_hash'] ?? null) === $hash) { return $this->result($session); }
                $this->expect($session, $expectedVersion);
                $allowed = match ($action) {
                    'save_materials', 'save_drafts' => ['action', 'global_fields', 'space_fields', 'draft_versions'],
                    'move' => ['action', 'stage'], 'question_position' => ['action', 'question_index'],
                    'review_confirm' => ['action', 'draft_versions', 'confirmation_intent'],
                    'complete' => ['action', 'draft_versions', 'expected_batch_version', 'confirmation_intent'],
                    'reconcile' => ['action'], default => throw new ProfileException('INVALID_ONBOARDING_ACTION', 'Choose a supported onboarding action.'),
                };
                if (array_diff(array_keys($payload), $allowed) !== []) { $this->invalid('Unsupported action fields.'); }
                switch ($action) {
                    case 'save_materials':
                        if (!in_array($session['stage'], ['materials', 'review'], true)) { $this->invalid('Return to the materials review before editing it.'); }
                        $this->assertProfilesCurrent($session);
                        $this->writeDrafts($session, 'input_drafts', $payload);
                        $session['resource_refs']['review_confirmed'] = false; $session['max_stage'] = 'review';
                        break;
                    case 'move':
                        $stage = $payload['stage'] ?? null;
                        if (!is_string($stage) || !in_array($stage, self::STAGES, true)) { $this->invalid('Choose a valid stage.'); }
                        $permittedNext = ($session['stage'] === 'materials' && $stage === 'review') || ($session['stage'] === 'draft' && $stage === 'privacy');
                        if (!$permittedNext && $this->rank($stage) > $this->rank($session['max_stage'])) { $this->invalid('Complete the preceding step first.'); }
                        if (in_array($stage, ['draft', 'privacy'], true)) { $this->assertOutputCurrent($session); }
                        if (in_array($stage, ['materials', 'review'], true)) { $this->ensureEditableInputs($session); }
                        $session['stage'] = $stage;
                        if ($this->rank($stage) > $this->rank($session['max_stage'])) { $session['max_stage'] = $stage; }
                        break;
                    case 'review_confirm':
                        if (!in_array($session['stage'], ['materials', 'review'], true)) { $this->invalid('Open the review before confirming it.'); }
                        $this->confirmation($payload); $this->assertProfilesCurrent($session);
                        $before = $session['resource_refs']['profile_versions'];
                        $this->confirmDrafts($session, 'input_drafts', $payload);
                        $session['resource_refs']['profile_versions'] = QuestionService::versions($this->workflow->profiles($ownerId, $session['space_id']));
                        if (!QuestionService::sameVersions($before, $session['resource_refs']['profile_versions'])) { $this->archiveOutputs($session); }
                        $session['resource_refs']['review_confirmed'] = true; $session['stage'] = 'questions'; $session['max_stage'] = 'questions';
                        break;
                    case 'question_position':
                        $index = $payload['question_index'] ?? null; $batch = $this->batch($session);
                        if (!is_int($index) || $index < 0 || $index >= count($batch['questions'])) { $this->invalid('Choose a question from this batch.'); }
                        $session['resource_refs']['question_index'] = $index;
                        break;
                    case 'save_drafts':
                        if (!in_array($session['stage'], ['draft', 'privacy'], true)) { $this->invalid('Open the generated profile before editing it.'); }
                        $this->assertOutputCurrent($session); $this->writeDrafts($session, 'output_drafts', $payload);
                        break;
                    case 'reconcile':
                        $this->archive($session);
                        unset($session['resource_refs']['ai_review_items'],$session['resource_refs']['ai_metrics'],$session['resource_refs']['generation_mode']);
                        $session['resource_refs']['input_drafts'] = $this->newDrafts($ownerId, $session['space_id']);
                        $session['resource_refs']['output_drafts'] = ['global' => null, 'space' => null];
                        $session['resource_refs']['profile_versions'] = QuestionService::versions($this->workflow->profiles($ownerId, $session['space_id']));
                        $session['resource_refs']['question_batch_id'] = null; $session['resource_refs']['synthesis_batch_version'] = null;
                        $session['resource_refs']['review_confirmed'] = false; $session['resource_refs']['question_index'] = 0;
                        $session['stage'] = 'review'; $session['max_stage'] = 'review';
                        break;
                    case 'complete':
                        if ($session['stage'] !== 'privacy') { $this->invalid('Review visibility before confirming the profile.'); }
                        $this->confirmation($payload); $this->assertOutputCurrent($session);
                        if (!is_int($payload['expected_batch_version'] ?? null) || $payload['expected_batch_version'] !== $session['resource_refs']['synthesis_batch_version']) { throw new ProfileException('BATCH_VERSION_CONFLICT', 'Confirm the profile prepared from the current answers.', 409); }
                        $session['resource_refs']['completed_questions'] = SessionProgress::questionCounts($this->batch($session), (int)$session['resource_refs']['question_index']);
                        $session['resource_refs']['completed_batch_version'] = $session['resource_refs']['synthesis_batch_version'];
                        $this->confirmDrafts($session, 'output_drafts', $payload);
                        $session['resource_refs']['profile_versions'] = QuestionService::versions($this->workflow->profiles($ownerId, $session['space_id']));
                        $session['resource_refs']['completion_request_hash'] = $hash;
                        $session['status'] = 'completed'; $session['stage'] = 'completed'; $session['completed_at'] = ($this->clock)();
                        break;
                }
                $this->save($session); return $this->result($session);
            });
        });
    }
    public function prepareQuestions(int $ownerId, string $id, int $expectedVersion): array
    {
        $known = $this->owned($ownerId, $id);
        return $this->workflow->transaction($ownerId, $known['space_id'], function () use ($ownerId, $id, $expectedVersion): array {
            return $this->repository->transaction(function () use ($ownerId, $id, $expectedVersion): array {
                $session = $this->owned($ownerId, $id, true);
                if ($session['status'] === 'active' && $session['resource_refs']['question_batch_id'] !== null && ($session['resource_refs']['batch_request_version'] ?? null) === $expectedVersion) { $this->assertProfilesCurrent($session); return $this->result($session); }
                $this->expect($session, $expectedVersion); $this->assertProfilesCurrent($session);
                if (!$session['resource_refs']['review_confirmed'] || $session['stage'] !== 'questions') { $this->invalid('Confirm the materials review first.'); }
                if ($session['resource_refs']['question_batch_id'] === null) {
                    $batch = $this->questions->prepare($ownerId, $session['space_id'], $session['resource_refs']['profile_versions']);
                    $session['resource_refs']['question_batch_id'] = $batch['id']; $session['resource_refs']['batch_request_version'] = $expectedVersion;
                    $session['resource_refs']['question_index'] = 0; $this->save($session);
                }
                return $this->result($session);
            });
        });
    }
    public function synthesize(int $ownerId, string $id, int $expectedVersion, int $expectedBatchVersion): array
    {
        $known = $this->owned($ownerId, $id);
        return $this->workflow->transaction($ownerId, $known['space_id'], function () use ($ownerId, $id, $expectedVersion, $expectedBatchVersion): array {
            return $this->repository->transaction(function () use ($ownerId, $id, $expectedVersion, $expectedBatchVersion): array {
                $session = $this->owned($ownerId, $id, true); $refs = $session['resource_refs'];
                if ($session['status'] === 'active' && $refs['output_drafts']['global'] !== null && $refs['synthesis_batch_version'] === $expectedBatchVersion && in_array($expectedVersion, [$session['version'], $refs['synthesis_request_version'] ?? null, $refs['synthesis_resume_request_version'] ?? null], true)) {
                    $this->assertOutputCurrent($session);
                    // A fresh user action resumes the existing editable result. Replays
                    // leave subsequent navigation untouched and never regenerate values.
                    if ($expectedVersion === $session['version'] && $session['stage'] === 'questions') {
                        $session['stage'] = 'draft';
                        if ($this->rank($session['max_stage']) < $this->rank('draft')) { $session['max_stage'] = 'draft'; }
                        $session['resource_refs']['synthesis_resume_request_version'] = $expectedVersion;
                        $this->save($session);
                    }
                    return $this->result($session);
                }
                $this->expect($session, $expectedVersion);
                if (!$refs['review_confirmed'] || !in_array($session['stage'], ['questions', 'draft', 'privacy'], true)) { $this->invalid('Complete the materials review and questions first.'); }
                $batch = $this->batch($session);
                $composed = $this->questions->compose($ownerId, $batch['id'], $expectedBatchVersion);
                if ($refs['output_drafts']['global'] !== null) { $this->archive($session); }
                $output = $this->newDrafts($ownerId, $session['space_id']);
                foreach ($this->scopes($session) as $scope => $spaceId) {
                    $draft = $this->workflow->getDraft($ownerId, $spaceId, $output[$scope]);
                    $fields = $composed[$scope . '_fields'];
                    if ($fields !== []) { $this->workflow->updateDraft($ownerId, $spaceId, $draft['id'], $draft['draft_version'], $fields); }
                }
                if(isset($session['resource_refs']['generation_mode'])){$session['resource_refs']['generation_mode']='rules';unset($session['resource_refs']['ai_metrics']['compose'],$session['resource_refs']['ai_review_items']['compose']);}
                $session['resource_refs']['output_drafts'] = $output; $session['resource_refs']['synthesis_batch_version'] = $expectedBatchVersion;
                $session['resource_refs']['synthesis_request_version'] = $expectedVersion;
                unset($session['resource_refs']['synthesis_resume_request_version']);
                $session['stage'] = 'draft'; $session['max_stage'] = 'draft'; $this->save($session);
                return $this->result($session);
            });
        });
    }
    private function owned(int $ownerId, string $id, bool $lock = false): array
    {
        $session = $this->repository->findSession($id, $lock);
        if ($session === null || (int)$session['owner_id'] !== $ownerId) { throw new ProfileException('ONBOARDING_NOT_FOUND', 'This onboarding session was not found.', 404); }
        return $session;
    }
    private function expect(array $session, int $version): void
    {
        if ($session['status'] !== 'active') { throw new ProfileException('ONBOARDING_COMPLETED', 'This onboarding session is complete. Start a new session to edit again.', 409); }
        if ($version < 1 || (int)$session['version'] !== $version) { throw new ProfileException('ONBOARDING_VERSION_CONFLICT', 'This session changed. Reload before saving.', 409, ['current_version' => $session['version']]); }
    }
    private function assertProfilesCurrent(array $session): void
    {
        $current = QuestionService::versions($this->workflow->profiles($session['owner_id'], $session['space_id']));
        if (!QuestionService::sameVersions($current, $session['resource_refs']['profile_versions'])) { throw new ProfileException('PROFILE_VERSION_CONFLICT', 'The confirmed profile changed. Review the latest information first.', 409, ['current_versions' => $current]); }
    }
    private function batch(array $session): array
    {
        $id = $session['resource_refs']['question_batch_id'];
        if ($id === null) { $this->invalid('Prepare the question batch first.'); }
        return $this->questions->get($session['owner_id'], $id);
    }
    private function assertOutputCurrent(array $session): void
    {
        $this->assertProfilesCurrent($session);
        if (!$session['resource_refs']['review_confirmed'] || $session['resource_refs']['output_drafts']['global'] === null) { $this->invalid('Prepare the profile draft first.'); }
        $batch = $this->batch($session);
        if ($batch['version'] !== $session['resource_refs']['synthesis_batch_version']) { throw new ProfileException('SYNTHESIS_OUTDATED', 'Answers changed. Prepare the profile again before continuing.', 409); }
    }
    private function scopes(array $session): array
    { return $session['space_id'] === null ? ['global' => null] : ['global' => null, 'space' => $session['space_id']]; }
    private function newDrafts(int $ownerId, ?int $spaceId): array
    {
        return ['global' => $this->workflow->createDraft($ownerId, null)['id'], 'space' => $spaceId === null ? null : $this->workflow->createDraft($ownerId, $spaceId)['id']];
    }
    private function ensureEditableInputs(array &$session): void
    {
        foreach ($this->scopes($session) as $scope => $spaceId) {
            $draft = $this->workflow->getDraft($session['owner_id'], $spaceId, $session['resource_refs']['input_drafts'][$scope]);
            if ($draft['status'] !== 'editing') { $session['resource_refs']['input_drafts'][$scope] = $this->workflow->createDraft($session['owner_id'], $spaceId)['id']; }
        }
    }
    private function checkedDrafts(array $session, string $kind, array $payload): array
    {
        $versions = $payload['draft_versions'] ?? null;
        if (!is_array($versions) || array_is_list($versions) || array_diff(array_keys($versions), array_keys($this->scopes($session))) !== []) { $this->invalid('Provide the expected draft versions for this context.'); }
        $drafts = [];
        foreach ($this->scopes($session) as $scope => $spaceId) {
            $expected = $versions[$scope] ?? null;
            if (!is_array($expected) || array_diff(array_keys($expected), ['draft_version', 'base_revision']) !== [] || !is_int($expected['draft_version'] ?? null) || !is_int($expected['base_revision'] ?? null)) { $this->invalid('Provide expected draft_version and base_revision.'); }
            $ref = $session['resource_refs'][$kind][$scope];
            if ($ref === null) { $this->invalid('The requested draft has not been created.'); }
            $draft = $this->workflow->getDraft($session['owner_id'], $spaceId, $ref);
            if ($draft['draft_version'] !== $expected['draft_version'] || $draft['base_revision'] !== $expected['base_revision']) { throw new ProfileException('DRAFT_VERSION_CONFLICT', 'The draft changed. Reload before saving.', 409); }
            if ($draft['status'] !== 'editing') { throw new ProfileException('DRAFT_NOT_EDITABLE', 'Return to the materials review to begin a new editable draft.', 409); }
            $drafts[$scope] = $draft;
        }
        return $drafts;
    }
    private function writeDrafts(array $session, string $kind, array $payload): void
    {
        $drafts = $this->checkedDrafts($session, $kind, $payload);
        foreach (['global_fields', 'space_fields'] as $name) { if (array_key_exists($name, $payload) && (!is_array($payload[$name]) || !array_is_list($payload[$name]) || count($payload[$name]) > 200)) { $this->invalid('Provide a bounded list of profile operations.'); } }
        if ($session['space_id'] === null && ($payload['space_fields'] ?? []) !== []) { $this->invalid('Space fields require a Space session.'); }
        foreach ($this->scopes($session) as $scope => $spaceId) {
            $fields = $payload[$scope . '_fields'] ?? [];
            if ($fields !== []) { $this->workflow->updateDraft($session['owner_id'], $spaceId, $drafts[$scope]['id'], $drafts[$scope]['draft_version'], $fields); }
        }
    }
    private function confirmDrafts(array $session, string $kind, array $payload): void
    {
        $drafts = $this->checkedDrafts($session, $kind, $payload);
        foreach ($this->scopes($session) as $scope => $spaceId) {
            $draft = $drafts[$scope];
            if ($draft['fields'] !== []) { $this->workflow->confirmDraft($session['owner_id'], $spaceId, $draft['id'], $draft['draft_version'], $draft['base_revision']); }
        }
    }
    private function confirmation(array $payload): void
    { if (($payload['confirmation_intent'] ?? null) !== 'confirm') { throw new ProfileException('CONFIRMATION_REQUIRED', 'Confirm the reviewed profile and visibility choices.'); } }
    private function archive(array &$session): void
    {
        $session['resource_refs']['history'][] = ['input_drafts' => $session['resource_refs']['input_drafts'], 'output_drafts' => $session['resource_refs']['output_drafts'], 'question_batch_id' => $session['resource_refs']['question_batch_id'], 'version' => $session['version']];
    }
    private function archiveOutputs(array &$session): void
    {
        if ($session['resource_refs']['question_batch_id'] !== null || $session['resource_refs']['output_drafts']['global'] !== null) { $this->archive($session); }
        unset($session['resource_refs']['ai_review_items'],$session['resource_refs']['ai_metrics'],$session['resource_refs']['generation_mode']);
        $session['resource_refs']['question_batch_id'] = null; $session['resource_refs']['synthesis_batch_version'] = null; $session['resource_refs']['question_index'] = 0;
        $session['resource_refs']['output_drafts'] = ['global' => null, 'space' => null];
    }
    private function save(array &$session): void
    { ++$session['version']; $session['updated_at'] = ($this->clock)(); $this->repository->saveSession($session); }
    private function result(array $session): array
    {
        $ownerId = $session['owner_id']; $spaceId = $session['space_id']; $profiles = $this->workflow->profiles($ownerId, $spaceId);
        $result = $session + ['profiles' => $profiles, 'input_drafts' => ['global' => null, 'space' => null], 'output_drafts' => ['global' => null, 'space' => null], 'question_batch' => null, 'generation_mode' => $session['resource_refs']['generation_mode']??'rules', 'llm_calls' => array_sum(array_map(static fn(array $m):int=>(int)($m['llm_calls']??0),$session['resource_refs']['ai_metrics']??[])), 'review_items'=>$session['resource_refs']['ai_review_items']??[]];
        foreach (['input_drafts', 'output_drafts'] as $kind) {
            foreach ($this->scopes($session) as $scope => $scopeSpace) {
                $id = $session['resource_refs'][$kind][$scope];
                if ($id !== null) { $result[$kind][$scope] = $this->workflow->getDraft($ownerId, $scopeSpace, $id); }
            }
        }
        if (($session['status']!=='completed'||!isset($session['resource_refs']['ai_metrics']['questions'])) && $session['resource_refs']['question_batch_id'] !== null) {
            try { $result['question_batch'] = $this->questions->get($ownerId, $session['resource_refs']['question_batch_id']); }
            catch(ProfileException $error) {
                if($error->errorCode!=='AI_RESULT_NOT_APPLICABLE')throw $error;
                $result['ai_result_outdated']=true;$result['output_drafts']=['global'=>null,'space'=>null];$result['review_items']=[];
                unset($result['resource_refs']['ai_review_items']);
            }
        }
        $result['profile_changed'] = !QuestionService::sameVersions(QuestionService::versions($profiles), $session['resource_refs']['profile_versions']);
        $result['needs_resynthesis'] = $result['question_batch'] !== null && $session['resource_refs']['output_drafts']['global'] !== null && $result['question_batch']['version'] !== $session['resource_refs']['synthesis_batch_version'];
        $tasks = $this->taskProgress === null ? ['tasks' => [], 'has_more' => false] : ($this->taskProgress)($ownerId, $session['id']);
        $completedCounts = null;
        if ($session['status'] === 'completed' && !isset($session['resource_refs']['completed_questions']) && $session['resource_refs']['question_batch_id'] !== null && $this->completedQuestionProgress !== null) {
            $completedCounts = ($this->completedQuestionProgress)($ownerId, $session['resource_refs']['question_batch_id'], (int)$session['resource_refs']['question_index']);
        }
        $result['progress'] = SessionProgress::project($result, $tasks, $completedCounts);
        return $result;
    }
    private function rank(string $stage): int { $rank = array_search($stage, self::STAGES, true); return $rank === false ? -1 : $rank; }
    private function invalid(string $message): never { throw new ProfileException('ONBOARDING_VALIDATION_FAILED', $message); }
}
