<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;
use humhub\modules\matcherRecommendation\contracts\CandidateRequest;

interface ContactEligibilityReader
{
    /** Person only. Recheck context. @return array<string,array{blocked:bool,friend:bool,pending_in:bool,pending_out:bool,version:string}> */
    public function readCurrent(CandidateRequest $request): array;
    /** Missing sent-history capability does not block ordinary discovery; it DOES block AI person recommendation. */
    public function supportsSentHistory(): bool;
    /**
     * Person only; authoritative successful request records, including all terminal states. Never infer from messages.
     * Unsupported/unavailable history throws, not an all-false map. Does not apply to idea candidates.
     * @return array<string,array{ever_sent:bool,version:string}>
     */
    public function readSentHistory(CandidateRequest $request): array;
}
