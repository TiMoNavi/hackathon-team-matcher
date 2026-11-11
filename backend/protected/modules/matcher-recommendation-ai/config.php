<?php
declare(strict_types=1);
use humhub\modules\matcherRecommendationAi\Module;
// Native package metadata only. No network, credentials, public route or automatic main-module mutation.
return ['id' => 'matcher-recommendation-ai', 'class' => Module::class, 'namespace' => 'humhub\modules\matcherRecommendationAi', 'strict' => true, 'events' => [], 'urlManagerRules' => []];
