<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendationAi;
use humhub\modules\matcherRecommendation\contracts\ports\{CandidateReranker, ConversationProvider, QueryInterpreter};
use humhub\modules\matcherRecommendation\application\ai\AiProviderRegistry;

/** Optional leaf package. The trusted host chooses providers and owns budgets and final authorization. */
final class Module extends \humhub\components\Module implements \humhub\modules\matcherRecommendation\contracts\ports\ConversationProviderSource
{
    private ?QueryInterpreter $interpreter = null;
    private ?CandidateReranker $reranker = null;
    private ?ConversationProvider $conversationProvider = null;
    private ?string $conversationRevision = null;
    private ?\humhub\modules\matcherRecommendationAi\adapters\gateway\GatewayConfig $conversationGateway = null;
    /** Trusted deployment config; never environment/credential auto-discovery or a network request. */
    public function configureConversationGateway(#[\SensitiveParameter] \humhub\modules\matcherRecommendationAi\adapters\gateway\GatewayConfig $config, string $revision): void
    {
        $this->revision($revision); $this->conversationRevision = $revision; $this->conversationGateway = $config; $this->conversationProvider = null;
    }
    public function configureConversationProvider(#[\SensitiveParameter] ConversationProvider $provider, string $revision): void
    {
        $this->revision($revision); $this->conversationRevision = $revision; $this->conversationProvider = $provider; $this->conversationGateway = null;
    }
    public function getConversationRevision(): string { return $this->conversationRevision ?? throw new \RuntimeException('Configure an explicit persistent conversation provider revision.'); }
    private function revision(string $revision): void
    { if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/D', $revision)) { throw new \InvalidArgumentException('Invalid conversation provider revision.'); } }
    public function setProviders(#[\SensitiveParameter] QueryInterpreter $interpreter, #[\SensitiveParameter] CandidateReranker $reranker): void { $this->interpreter = $interpreter; $this->reranker = $reranker; }
    public function hasProviders(): bool { return $this->interpreter !== null && $this->reranker !== null; }
    public function getQueryInterpreter(): QueryInterpreter { return $this->interpreter ?? throw new \RuntimeException('The optional AI provider is not configured.'); }
    public function getCandidateReranker(): CandidateReranker { return $this->reranker ?? throw new \RuntimeException('The optional AI provider is not configured.'); }
    public function setConversationProvider(#[\SensitiveParameter] ConversationProvider $provider): void { $this->conversationProvider = $provider; $this->conversationRevision = null; $this->conversationGateway = null; }
    public function hasConversationProvider(): bool { return $this->conversationProvider !== null || $this->conversationGateway !== null; }
    public function getConversationProvider(): ConversationProvider
    {
        if ($this->conversationProvider === null && $this->conversationGateway !== null) {
            $this->conversationProvider = new \humhub\modules\matcherRecommendationAi\adapters\conversation\ChatConversationProvider(
                new \humhub\modules\matcherRecommendationAi\adapters\gateway\ChatCompletionsClient($this->conversationGateway, new \humhub\modules\matcherRecommendationAi\adapters\gateway\CurlGatewayTransport()));
        }
        return $this->conversationProvider ?? throw new \RuntimeException('The optional conversation provider is not configured.');
    }
    /** Explicit trusted registration. Merely loading/enabling the package never registers a provider. */
    public function attach(#[\SensitiveParameter] AiProviderRegistry $registry, string $id = 'matcher-recommendation-ai'): string
    {
        return $registry->register($id, $this->getQueryInterpreter(), $this->getCandidateReranker());
    }
    /** Conversation-only hosts opt in explicitly, independently from the legacy interpreter/reranker pair. */
    public function attachConversation(#[\SensitiveParameter] AiProviderRegistry $registry, string $id = 'matcher-recommendation-ai'): string
    {
        return $registry->registerConversation($id, $this->getConversationProvider());
    }
    public function detach(#[\SensitiveParameter] AiProviderRegistry $registry, string $id = 'matcher-recommendation-ai'): void { $registry->unregister($id); }
    public function __debugInfo(): array { return ['id' => 'matcher-recommendation-ai', 'configured' => $this->hasProviders(), 'conversation_configured' => $this->hasConversationProvider()]; }
    public function __serialize(): array { throw new \RuntimeException('AI modules cannot serialize configured providers.'); }
    public function __unserialize(#[\SensitiveParameter] array $data): void { throw new \RuntimeException('AI modules cannot restore serialized providers.'); }
    public function disable()
    {
        $core = \Yii::$app->getModule('matcher-recommendation');
        if ($core instanceof \humhub\modules\matcherRecommendation\Module) { $core->pauseConversations($this->id); }
        $this->getModuleService()->disable(); return true;
    }
}
