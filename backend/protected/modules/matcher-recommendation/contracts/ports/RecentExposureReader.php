<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;
use humhub\modules\matcherRecommendation\contracts\CandidateRequest;

/** Viewer-and-Space scoped presentation history, never global popularity or a candidate penalty. */
interface RecentExposureReader
{
    /**
     * Return one nonnegative count for every requested, already authorized candidate.
     * Counts concern this viewer in the current Space only; skips, replies, profile length and social degree are not scores.
     * Zero means an authoritative empty history. Unavailable/incomplete history throws.
     * The optional adapter is not called when there are no current matches.
     * @return array<string,int>
     */
    public function read(CandidateRequest $request): array;
}
