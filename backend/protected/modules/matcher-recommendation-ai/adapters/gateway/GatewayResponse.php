<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendationAi\adapters\gateway;
final class GatewayResponse
{
    private readonly \SensitiveParameterValue $content;
    public function __construct(public readonly int $status, #[\SensitiveParameter] string $body) { $this->content = new \SensitiveParameterValue($body); }
    public function body(): string { return $this->content->getValue(); }
    public function __debugInfo(): array { return ['status' => $this->status, 'body' => '[redacted]']; }
    public function __serialize(): array { throw new ProviderException('serialization_forbidden'); }
    public function __unserialize(#[\SensitiveParameter] array $data): void { throw new ProviderException('serialization_forbidden'); }
}
