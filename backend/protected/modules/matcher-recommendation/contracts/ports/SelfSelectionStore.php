<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;
use humhub\modules\matcherRecommendation\contracts\CurrentEventContext;
use humhub\modules\matcherRecommendation\contracts\analysis\SelectedSelfAttributes;

/** Server-owned selection authority, bound to authenticated session and exact activity context. */
interface SelfSelectionStore
{
    /**
     * One read of the actor/session monotonic version and current-context authority.
     * An old context or invalidated write retains its version but supplies no selection grant.
     * @return array{version:int,selection:?SelectedSelfAttributes}
     */
    public function state(CurrentEventContext $context): array;
    public function read(CurrentEventContext $context): ?SelectedSelfAttributes;
    /** Zero means no actor/session row. Every replacement increments across activity contexts. */
    public function replace(CurrentEventContext $context, int $expectedVersion, SelectedSelfAttributes $selection): void;
}
