<?php
declare(strict_types=1);
namespace humhub\modules\matcherResumeImport\domain;

use humhub\modules\matcherProfile\domain\ExplicitTextCandidateMapper;

/** Backward-compatible resume entry point for the shared explicit-text rules. */
final class ResumeCandidateMapper
{
    public function map(array $sections): array
    {
        return (new ExplicitTextCandidateMapper())->map($sections);
    }
}
