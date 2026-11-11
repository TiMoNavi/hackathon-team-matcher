<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\native;
use humhub\modules\matcherRecommendation\contracts\{ContractShape, CurrentEventContext};
use humhub\modules\matcherRecommendation\contracts\ports\CurrentEventAccess;
use humhub\modules\matcherRecommendation\domain\config\Fingerprint;
use yii\db\Connection;

/** Fresh native authorization; a supplied CurrentEventContext never grants access by itself. */
final class NativeCurrentEventAccess implements CurrentEventAccess
{
    private readonly NativeEligibilityQuery $native;

    /** policyVersion is an explicitly supplied activity access-policy version, never the rule-scoring version. */
    public function __construct(Connection $db, private readonly ServerSelectionSource $selection, private readonly string $policyVersion)
    {
        ContractShape::token($policyVersion);
        $this->native = new NativeEligibilityQuery($db);
    }

    public function resolve(int $viewerId, ?int $requestedSpaceId = null): CurrentEventContext
    {
        $selected = $this->selectionSnapshot();
        if ($viewerId !== $selected['actor_id'] || ($requestedSpaceId !== null && $requestedSpaceId !== $selected['space_id'])) {
            throw new NativeAccessException('current_event_mismatch');
        }
        $facts = $this->native->viewerFacts($viewerId, $selected['space_id']);
        if ($this->selectionSnapshot() !== $selected) { throw new NativeAccessException('context_changed'); }
        $version = 'native-access:' . Fingerprint::of(['selection' => $selected, 'policy' => $this->policyVersion, 'facts' => $facts]);
        return new CurrentEventContext($viewerId, $selected['space_id'], $version, $this->policyVersion);
    }

    public function assertCurrent(CurrentEventContext $context): void
    {
        $current = $this->resolve($context->viewerId, $context->spaceId);
        if ($current->accessVersion !== $context->accessVersion || $current->policyVersion !== $context->policyVersion) {
            throw new NativeAccessException('context_changed');
        }
    }

    private function selectionSnapshot(): array
    {
        try { $selected = $this->selection->read(); }
        catch (NativeAccessException $error) { throw $error; }
        catch (\Throwable $error) { throw new NativeAccessException('dependency_unavailable', $error); }
        $keys = array_keys($selected); sort($keys, SORT_STRING);
        if ($keys !== ['actor_id', 'selection_revision', 'space_id'] || !is_int($selected['actor_id']) || $selected['actor_id'] <= 0
            || !is_int($selected['space_id']) || $selected['space_id'] <= 0 || !is_string($selected['selection_revision'])) {
            throw new NativeAccessException('current_event_required');
        }
        try { ContractShape::token($selected['selection_revision']); }
        catch (\InvalidArgumentException $error) { throw new NativeAccessException('current_event_required', $error); }
        return $selected;
    }
}
