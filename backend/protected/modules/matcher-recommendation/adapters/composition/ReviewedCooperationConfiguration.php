<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\composition;

use humhub\modules\matcherRecommendation\domain\analysis\AnalysisMapping;

/** Explicitly reviewed P1 schema-2 meaning. No score, permission or model grant. */
final class ReviewedCooperationConfiguration
{
    // Reviewed against the 37 ordinary P1 definitions on 2026-11-12, never signed from a live read.
    public const CATALOG_FINGERPRINT = '75fc32de2dae088716251675a1e2b5f6584cea2475e78b5c1da37e55ded06434';
    public static function bindings(): array
    {
        return ['directions' => 'project_directions', 'skills' => 'declared_skills',
            'project_skills' => 'project_technologies', 'offered_skills' => 'event_offered_skills',
            'needed_skills' => 'event_needed_skills', 'offered_roles' => 'event_offered_roles',
            'needed_roles' => 'event_needed_roles', 'availability' => 'event_availability',
            'collaboration_modes' => 'event_collaboration_modes', 'communication' => 'communication_preferences'];
    }
    public static function mapping(): AnalysisMapping
    {
        return new AnalysisMapping('p1-cooperation-page-v1', 2, [
            'topics' => ['directions'], 'capability_skills' => ['skills', 'project_skills'],
            'offered_skills' => ['offered_skills'], 'needed_skills' => ['needed_skills'],
            'offered_roles' => ['offered_roles'], 'needed_roles' => ['needed_roles'],
            'availability' => ['availability'], 'collaboration_modes' => ['collaboration_modes'],
            'communication_preferences' => ['communication'],
        ]);
    }
}
