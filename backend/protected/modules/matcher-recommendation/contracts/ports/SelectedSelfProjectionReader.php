<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;

use humhub\modules\matcherRecommendation\contracts\{CandidateProjection, CurrentEventContext};
use humhub\modules\matcherRecommendation\contracts\analysis\SelectedSelfAttributes;

/**
 * Narrow future adapter to the existing profile and explicit-selection owning services.
 * This interface creates no storage, selection authority, consent flag, or fallback permission.
 * Implementations must use purpose-reviewed confirmed/authenticated minimal projections;
 * never pass a full owner profile, friends/private fields, drafts, raw sources, or overview here.
 */
interface SelectedSelfProjectionReader
{
    /**
     * Independently verify owner, current Space, authoritative selection ID/version and exact
     * selected reference set, mapping purpose, profile/content/permission/schema/policy/identity
     * versions. Reject withdrawal/replacement/revocation even if values did not change.
     * This is a fresh check on every call; a request object or a previous read grants nothing.
     * Empty selections validate metadata only and MUST NOT fetch any self attribute values.
     * Throw on unavailable authority or failed checks; never silently accept or widen a selection.
     */
    public function assertCurrent(CurrentEventContext $context, SelectedSelfAttributes $selection): void;

    /**
     * Only nonempty explicit selections. Revalidate the same authority and return exact selected
     * evidence with only mapped logical features. No unselected values may enter a feature bundle.
     * Missing or unreviewed selected attributes fail closed; do not replace them with nearby values.
     * Dependency failures throw and cannot become an apparently successful empty projection.
     */
    public function read(CurrentEventContext $context, SelectedSelfAttributes $selection): CandidateProjection;
}
