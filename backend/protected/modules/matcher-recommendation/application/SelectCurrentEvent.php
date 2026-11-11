<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\application;
use humhub\modules\matcherRecommendation\contracts\{ContractShape, CurrentEventContext};
use humhub\modules\matcherRecommendation\contracts\ports\CurrentEventSelectionWriter;

/** Internal explicit-switch use case. An eventual HTTP action still owns CSRF and real user-action validation. */
final class SelectCurrentEvent
{
    public function __construct(private readonly CurrentEventSelectionWriter $selection) {}

    public function execute(int $spaceId, ?string $expectedRevision): CurrentEventContext
    {
        if ($spaceId < 1) { throw new \InvalidArgumentException('A positive target Space is required.'); }
        if ($expectedRevision !== null) {
            ContractShape::token($expectedRevision);
            if (strlen($expectedRevision) > 64) { throw new \InvalidArgumentException('Invalid selection revision.'); }
        }
        $context = $this->selection->select($spaceId, $expectedRevision);
        if ($context->spaceId !== $spaceId) { throw new \UnexpectedValueException('Selection returned a different Space.'); }
        return $context;
    }
}
