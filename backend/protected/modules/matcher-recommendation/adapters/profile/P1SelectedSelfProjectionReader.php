<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\profile;

use humhub\modules\matcherRecommendation\contracts\{CandidateProjection, CurrentEventContext};
use humhub\modules\matcherRecommendation\contracts\analysis\{CooperationAnalysisException, SelectedSelfAttributes};
use humhub\modules\matcherRecommendation\contracts\ports\{CurrentEventAccess, SelectedSelfProjectionReader, SelfAnalysisProfileReader, SelfSelectionStore};
use humhub\modules\matcherRecommendation\domain\config\Fingerprint;

/** Selection authority and owner data authority are verified separately, before and after reads. */
final class P1SelectedSelfProjectionReader implements SelectedSelfProjectionReader
{
    public function __construct(private readonly CurrentEventAccess $events, private readonly SelfSelectionStore $selections, private readonly SelfAnalysisProfileReader $profiles) {}
    public function assertCurrent(CurrentEventContext $context, SelectedSelfAttributes $selection): void
    {
        try {
            $this->events->assertCurrent($context); $current = $this->selections->read($context);
            if ($current === null || Fingerprint::of($current) !== Fingerprint::of($selection)) { throw new CooperationAnalysisException('selection_unavailable'); }
            $metadata = $this->profiles->read($context, []);
            if (Fingerprint::of($metadata->versions) !== Fingerprint::of($selection->expectedVersions)) { throw new CooperationAnalysisException('selection_unavailable'); }
            $fresh = $this->selections->read($context);
            if ($fresh === null || Fingerprint::of($fresh) !== Fingerprint::of($selection)) { throw new CooperationAnalysisException('selection_unavailable'); }
            $this->events->assertCurrent($context);
        } catch (CooperationAnalysisException $error) { throw new CooperationAnalysisException($error->reason); }
        catch (\Throwable) { throw new CooperationAnalysisException('dependency_unavailable'); }
    }
    public function read(CurrentEventContext $context, SelectedSelfAttributes $selection): CandidateProjection
    {
        $this->assertCurrent($context, $selection);
        if ($selection->references === []) { throw new CooperationAnalysisException('invalid_request'); }
        $projection = $this->profiles->read($context, array_map(static fn($ref) => $ref->sourceId, $selection->references));
        if (Fingerprint::of($projection->versions) !== Fingerprint::of($selection->expectedVersions)) { throw new CooperationAnalysisException('selection_unavailable'); }
        $this->assertCurrent($context, $selection);
        return $projection;
    }
}
