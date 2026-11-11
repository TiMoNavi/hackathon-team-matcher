<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\application\ai;
use humhub\modules\matcherRecommendation\contracts\ports\{QueryInterpreter, CandidateReranker, ConversationProvider};
use humhub\modules\matcherRecommendation\domain\ai\AiRecommendationException;

/** Optional process-local capability registration. Core never imports an AI plugin implementation. */
final class AiProviderRegistry
{
    private ?string $id = null;
    private ?string $generation = null;
    private ?QueryInterpreter $query = null;
    private ?CandidateReranker $rank = null;
    private ?string $conversationId = null;
    private ?string $conversationGeneration = null;
    private ?ConversationProvider $conversation = null;

    public function register(string $id, #[\SensitiveParameter] QueryInterpreter $interpreter, #[\SensitiveParameter] CandidateReranker $reranker): string
    {
        if (!preg_match('/^[a-z][a-z0-9-]{0,63}$/D', $id)) { throw new AiRecommendationException('invalid_request'); }
        $this->id = $id; $this->query = $interpreter; $this->rank = $reranker;
        return $this->generation = bin2hex(random_bytes(24));
    }
    public function unregister(string $id): void
    {
        if ($this->id === $id) {
            $this->id = null; $this->generation = null; $this->query = null; $this->rank = null;
        }
        if ($this->conversationId === $id) {
            $this->conversationId = null; $this->conversationGeneration = null; $this->conversation = null;
        }
    }
    /** Conversation is an independent optional capability; no legacy provider pair is required. */
    public function registerConversation(string $id, #[\SensitiveParameter] ConversationProvider $provider): string
    {
        if (!preg_match('/^[a-z][a-z0-9-]{0,63}$/D', $id)) { throw new AiRecommendationException('invalid_request'); }
        $this->conversationId = $id; $this->conversation = $provider;
        return $this->conversationGeneration = bin2hex(random_bytes(24));
    }
    /** Process-local generation only, not a persistent epoch across requests. */
    public function conversationIdentity(): string { return $this->conversationGeneration ?? throw new AiRecommendationException('provider_unconfigured'); }
    /** Detach prevents future lookups; the host must guard already-held providers and in-flight jobs. */
    public function conversation(): ConversationProvider { return $this->conversation ?? throw new AiRecommendationException('provider_unconfigured'); }
    public function identity(): string { return $this->generation ?? throw new AiRecommendationException('provider_unconfigured'); }
    public function interpreter(): QueryInterpreter { return $this->query ?? throw new AiRecommendationException('provider_unconfigured'); }
    public function reranker(): CandidateReranker { return $this->rank ?? throw new AiRecommendationException('provider_unconfigured'); }
    public function __serialize(): array { throw new \LogicException('AI provider capabilities cannot be serialized.'); }
    public function __unserialize(#[\SensitiveParameter] array $data): void { throw new \LogicException('AI provider capabilities cannot be restored.'); }
    public function __debugInfo(): array { return ['registered' => $this->id !== null, 'conversation_registered' => $this->conversationId !== null]; }
}
