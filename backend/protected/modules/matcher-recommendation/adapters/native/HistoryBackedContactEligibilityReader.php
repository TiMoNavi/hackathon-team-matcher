<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\native;
use humhub\modules\matcherRecommendation\contracts\CandidateRequest;
use humhub\modules\matcherRecommendation\contracts\ports\{ContactEligibilityReader, CurrentEventAccess};

/** History capability may supply only sent-history. Native current blocks/friends/pending remain authoritative. */
final class HistoryBackedContactEligibilityReader implements ContactEligibilityReader
{
    public function __construct(private readonly NativeContactEligibilityReader $native, private readonly ContactEligibilityReader $history, private readonly CurrentEventAccess $events) {}
    public function readCurrent(CandidateRequest $request): array { return $this->native->readCurrent($request); }
    public function supportsSentHistory(): bool { return $this->history->supportsSentHistory(); }
    public function readSentHistory(CandidateRequest $request): array
    {
        $this->events->assertCurrent($request->context); $result = $this->history->readSentHistory($request);
        $this->events->assertCurrent($request->context); return $result;
    }
}
