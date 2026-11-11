<?php
declare(strict_types=1);
namespace humhub\modules\matcherOnboarding\controllers;

use humhub\modules\matcherOnboarding\adapters\http\JsonController;
use humhub\modules\matcherOnboarding\Module;
use humhub\modules\matcherProfile\domain\ProfileException;
use Yii;

/** Parse transport inputs and delegate every state transition to the shared services. */
final class ApiController extends JsonController
{
    public function actionSessions(): array
    {
        $this->method('POST'); $actor = $this->actor();
        $data = $this->body(['space_id','generation_mode']); $this->rules($data);
        $space = isset($data['space_id']) ? $this->positiveId($data['space_id']) : null;
        $result = $this->create('onboarding-sessions:' . ($space ?? 'global'), $data,
            fn() => $this->services()->profileModule()->getProfileWorkflow()->transaction($actor, $space, static fn() => null, false),
            fn() => $this->services()->getOnboardingService()->start($actor, $space));
        return $this->ok($result, 201);
    }
    public function actionSession(string $id): array
    {
        $id = $this->uuid($id); $actor = $this->actor(); $service = $this->services()->getOnboardingService();
        if (Yii::$app->request->method === 'GET') { return $this->ok($service->get($actor, $id)); }
        $this->method('PUT');
        $data = $this->body(['expected_version','action','global_fields','space_fields','draft_versions','stage','confirmation_intent','question_index','expected_batch_version']);
        $actions = [
            'save_materials' => ['global_fields','space_fields','draft_versions'],
            'move' => ['stage'], 'review_confirm' => ['confirmation_intent','draft_versions'],
            'question_position' => ['question_index'], 'save_drafts' => ['global_fields','space_fields','draft_versions'],
            'reconcile' => [], 'complete' => ['confirmation_intent','draft_versions','expected_batch_version'],
        ];
        if (!is_string($data['action'] ?? null) || !isset($actions[$data['action']])) { throw new ProfileException('INVALID_ACTION', 'Provide a supported workflow action.'); }
        if (array_diff(array_keys($data), array_merge(['expected_version','action'], $actions[$data['action']])) !== []) { throw new ProfileException('UNKNOWN_FIELD', 'This action contains unsupported fields.'); }
        $version = $this->version($data); unset($data['expected_version']);
        return $this->ok($service->update($actor, $id, $version, $data));
    }
    public function actionQuestionBatches(): array
    {
        $this->method('POST'); $actor = $this->actor();
        $data = $this->body(['session_id','expected_version','generation_mode']);
        if(($data['generation_mode']??'rules')==='ai'){unset($data['generation_mode']);return $this->ok($this->services()->getAiJobService()->submit($actor,'questions',$data,$this->requestKey()),202);}
        $this->rules($data);
        $id = $this->uuid($data['session_id'] ?? null); $version = $this->version($data); $service = $this->services()->getOnboardingService();
        $result = $this->create('onboarding-question-batch:' . $id, $data, fn() => $service->get($actor, $id), fn() => $service->prepareQuestions($actor, $id, $version));
        return $this->ok($result, 201);
    }
    public function actionSessionProgress(string $id): array
    { $this->method('GET'); return $this->ok($this->services()->getOnboardingService()->getProgress($this->actor(), $this->uuid($id))); }
    public function actionQuestionBatch(string $batchId): array
    {
        $this->method('GET');
        return $this->ok($this->services()->profileModule()->getQuestionService()->get($this->actor(), $this->uuid($batchId)));
    }
    public function actionAnswer(string $batchId, string $questionId): array
    {
        $this->method('PUT');
        if (!preg_match('/^[A-Za-z0-9_.:-]{1,96}$/D', $questionId)) { throw new ProfileException('INVALID_ID', 'Provide a valid question ID.'); }
        $data = $this->body(['expected_version','answer_type','selected_options','free_text']); $version = $this->version($data); unset($data['expected_version']);
        return $this->ok($this->services()->profileModule()->getQuestionService()->answer($this->actor(), $this->uuid($batchId), $questionId, $version, $data));
    }
    public function actionSyntheses(): array
    {
        $this->method('POST'); $actor = $this->actor();
        $data = $this->body(['session_id','expected_version','expected_batch_version','generation_mode']);
        if(($data['generation_mode']??'rules')==='ai'){unset($data['generation_mode']);return $this->ok($this->services()->getAiJobService()->submit($actor,'compose',$data,$this->requestKey()),202);}
        $this->rules($data);
        $id = $this->uuid($data['session_id'] ?? null); $version = $this->version($data); $batchVersion = $this->version($data, 'expected_batch_version'); $service = $this->services()->getOnboardingService();
        $result = $this->create('onboarding-synthesis:' . $id, $data, fn() => $service->get($actor, $id), fn() => $service->synthesize($actor, $id, $version, $batchVersion));
        return $this->ok($result, 201);
    }
    public function actionAiCapabilities(): array
    { $this->method('GET');return $this->ok($this->services()->getAiJobService()->capabilities($this->actor())); }
    public function actionAiJob(string $id): array
    { $this->method('GET');return $this->ok($this->services()->getAiJobService()->get($this->actor(),$this->uuid($id))); }
    public function actionAiJobProgress(string $id): array
    { $this->method('GET');return $this->ok($this->services()->getAiJobService()->getProgress($this->actor(),$this->uuid($id))); }
    public function actionAiCancel(string $id): array
    { $this->method('POST');$this->body([]);return $this->ok($this->services()->getAiJobService()->cancel($this->actor(),$this->uuid($id))); }
    public function actionAiRetry(string $id): array
    { $this->method('POST');$this->body([]);return $this->ok($this->services()->getAiJobService()->retry($this->actor(),$this->uuid($id),$this->requestKey()),202); }
    public function actionAiApply(string $id): array
    { $this->method('POST');$data=$this->body(['draft_id','expected_draft_version','candidate_ids']);return $this->ok($this->services()->getAiJobService()->apply($this->actor(),$this->uuid($id),$data,$this->requestKey())); }
    private function requestKey(): string
    { $value=Yii::$app->request->headers->get('Idempotency-Key');return is_string($value)?$value:''; }
    private function rules(array $data): void
    {
        $mode = $data['generation_mode'] ?? 'rules';
        if ($mode === 'ai') { throw new ProfileException('GENERATION_MODE_UNAVAILABLE', 'AI generation is not enabled. Choose rules to continue.', 503, ['available_modes' => ['rules']]); }
        if ($mode !== 'rules') { throw new ProfileException('INVALID_GENERATION_MODE', 'Use a supported generation mode.'); }
    }
    private function create(string $route, array $payload, callable $authorize, callable $perform): array
    {
        $profile = $this->services()->profileModule();
        return $profile->getIdempotencyGuard()->run($this->actor(), $route, Yii::$app->request->headers->get('Idempotency-Key'), $payload,
            function () use ($profile, $authorize): void { $profile->getAccessPolicy()->assertWritable(); $authorize(); }, $perform,
            static function (array $receipt) use ($authorize): void { $authorize(); });
    }
    private function services(): Module { return $this->module; }
}
