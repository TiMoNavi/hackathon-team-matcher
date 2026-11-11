<?php
declare(strict_types=1);
namespace humhub\modules\matcherOnboardingAi;
use humhub\modules\matcherOnboardingAi\adapters\config\PrivateConfigLoader;
use humhub\modules\matcherOnboardingAi\adapters\network\CurlChatTransport;
use humhub\modules\matcherOnboardingAi\application\StructuredProfileAiEngine;
use humhub\modules\matcherProfile\domain\ports\ProfileAiEngine;

final class Module extends \humhub\components\Module
{
    /** Trusted server composition only. Never a user-facing module setting. */
    public ?string $configPath = null;
    private ?ProfileAiEngine $engine = null;
    public function getAiEngine(): ProfileAiEngine
    {
        if ($this->engine === null) { $this->engine = new StructuredProfileAiEngine((new PrivateConfigLoader())->load($this->configPath ?? dirname(__DIR__, 4) . '/.local/profile-ai.json'), new CurlChatTransport()); }
        return $this->engine;
    }
    public function setAiEngine(ProfileAiEngine $engine): void { $this->engine = $engine; }
    public function getEngine(): ProfileAiEngine { return $this->getAiEngine(); }
}
