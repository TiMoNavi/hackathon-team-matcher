<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain\ai;
use humhub\modules\matcherRecommendation\contracts\{CurrentEventContext, QueryIntent};
use humhub\modules\matcherRecommendation\domain\RulePolicy;

/** Internal synchronous session only. Not a persisted AIJob or an externally writable run DTO. */
final class InternalAiRun
{
    public int $version = 1;
    public int $calls = 0;
    public int $rounds = 0;
    public bool $repairUsed = false;
    public bool $searchUsed = false;
    public bool $busy = false;
    public string $interaction = 'processing';
    public string $execution = 'queued';
    public string $applicability = 'current';
    public ?string $error = null;
    public ?array $question = null;
    public array $answers = [];
    public array $answerKeys = [];
    public array $items = [];
    public array $matches = [];
    public ?string $authorizationFingerprint = null;
    public ?QueryIntent $intent = null;

    public function __construct(
        public readonly string $id, public readonly CurrentEventContext $context,
        public readonly string $providerIdentity, public readonly RulePolicy $policy,
        public readonly string $mode, public readonly string $message,
        public readonly \DateTimeImmutable $createdAt, public readonly \DateTimeImmutable $expiresAt,
    ) {}
    public function __serialize(): array { throw new \LogicException('Internal AI sessions require an explicit durable run adapter.'); }
    public function __unserialize(#[\SensitiveParameter] array $data): void { throw new \LogicException('Internal AI sessions cannot be restored from serialized input.'); }
    public function __debugInfo(): array { return ['id' => $this->id, 'status' => $this->interaction, 'calls' => $this->calls]; }
}
