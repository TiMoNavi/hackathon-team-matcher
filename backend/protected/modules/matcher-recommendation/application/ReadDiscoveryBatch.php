<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\application;
use humhub\modules\matcherRecommendation\contracts\{CandidateProjection, CandidateRequest, CurrentEventContext, DiscoveryCursor};
use humhub\modules\matcherRecommendation\contracts\ports\{CandidateProjectionReader, Clock, ContactEligibilityReader, CurrentEventAccess, DiscoveryBatchStore, DiscoveryCursorCodec, PolicyStore};
use humhub\modules\matcherRecommendation\domain\{BatchReplayException, DiscoveryBatch, DiscoveryBatchItem, DiscoveryBatchPage};
use humhub\modules\matcherRecommendation\domain\config\Fingerprint;

/**
 * Reauthorize a fixed, bounded batch. No recall, rescore, replacement candidates or model call exists here.
 * Two complete observations detect changes during replay; they are not a global atomic authorization epoch.
 */
final class ReadDiscoveryBatch
{
    public function __construct(
        private readonly CurrentEventAccess $events,
        private readonly CandidateProjectionReader $profiles,
        private readonly ContactEligibilityReader $relationships,
        private readonly PolicyStore $policies,
        private readonly DiscoveryBatchStore $batches,
        private readonly Clock $clock,
        private readonly DiscoveryCursorCodec $cursors,
    ) {}

    public function execute(int $viewerId, string $batchId, ?string $cursor = null, int $limit = 24, ?int $requestedSpaceId = null): DiscoveryBatchPage
    {
        try {
            if ($viewerId < 1 || $batchId === '' || strlen($batchId) > 128 || trim($batchId) !== $batchId || preg_match('/[\x00-\x1f\x7f]/', $batchId)
                || $limit < 1 || $limit > 48 || ($requestedSpaceId !== null && $requestedSpaceId < 1) || $cursor === '') {
                throw new BatchReplayException('invalid_request');
            }
            $context = $this->events->resolve($viewerId, $requestedSpaceId);
            if ($context->viewerId !== $viewerId || ($requestedSpaceId !== null && $context->spaceId !== $requestedSpaceId)) { throw new BatchReplayException('batch_invalidated'); }
            $this->events->assertCurrent($context);
            $batch = $this->batches->get($batchId);
            if ($batch === null) { throw new BatchReplayException('batch_not_found'); }
            $this->assertBatch($batch, $context);
            $this->assertPolicy($batch, $context);
            $batchFingerprint = $this->batchFingerprint($batch);
            $position = 0;
            if ($cursor !== null) {
                $continuation = $this->cursors->decode($cursor);
                $this->assertCursor($continuation, $batchId, $batch, $context, $batchFingerprint);
                $position = $continuation->position;
                if ($position >= count($batch->targetIds)) { throw new BatchReplayException('cursor_invalid'); }
            }
            // Every page checks all saved people, including page-external members and exhausted/empty batches.
            $request = new CandidateRequest($context, 'person', $batch->targetIds);
            [$profiles, $relationships] = $this->readAll($request, $batch);
            $this->events->assertCurrent($context);
            $this->assertPolicy($batch, $context);
            [$freshProfiles, $freshRelationships] = $this->readAll($request, $batch);
            if (Fingerprint::of($profiles) !== Fingerprint::of($freshProfiles) || Fingerprint::of($relationships) !== Fingerprint::of($freshRelationships)) {
                throw new BatchReplayException('batch_invalidated');
            }
            $items = [];
            foreach (array_slice($batch->targetIds, $position, $limit) as $index => $id) {
                $items[] = new DiscoveryBatchItem($position + $index, $freshProfiles[$id], $freshRelationships[$id]);
            }
            $nextPosition = $position + count($items);
            $nextCursor = $nextPosition < count($batch->targetIds)
                ? $this->cursors->encode(new DiscoveryCursor($batchId, $context->viewerId, $context->spaceId, Fingerprint::of($context), $batch->queryHash, $batch->policyVersion, $batch->policyFingerprint, $batchFingerprint, $nextPosition, $batch->createdAt, $batch->expiresAt))
                : null;
            // Storage and policy can change independently of profile reads. Bind the exact saved ordered batch.
            $savedAgain = $this->batches->get($batchId);
            if ($savedAgain === null || $this->batchFingerprint($savedAgain) !== $batchFingerprint) { throw new BatchReplayException('batch_invalidated'); }
            $this->assertPolicy($batch, $context);
            $this->events->assertCurrent($context);
            $this->assertBatch($batch, $context);
            return new DiscoveryBatchPage($batchId, $context, $items, $position, count($batch->targetIds), $limit, $nextCursor, $batch->expiresAt);
        } catch (BatchReplayException $error) {
            // Recreate at the public boundary so exception traces cannot retain private projection-map arguments.
            throw new BatchReplayException($error->reason);
        } catch (\Throwable) { throw new BatchReplayException('dependency_unavailable'); }
    }

    private function assertBatch(DiscoveryBatch $batch, CurrentEventContext $context): void
    {
        $now = $this->clock->now();
        if ($now >= $batch->expiresAt) { throw new BatchReplayException('batch_expired'); }
        if ($batch->createdAt > $now || $batch->expiresAt > $batch->createdAt->add(new \DateInterval('PT15M'))
            || $batch->expiresAt <= $batch->createdAt || Fingerprint::of($batch->context) !== Fingerprint::of($context)
            || $batch->policyFingerprint === null || !preg_match('/^[a-f0-9]{64}$/D', $batch->policyFingerprint)) {
            throw new BatchReplayException('batch_invalidated');
        }
        foreach ($batch->targetIds as $id) {
            if (!preg_match('/^[1-9][0-9]*$/D', $id) || filter_var($id, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) === false
                || $id === (string)$context->viewerId || !preg_match('/^[a-f0-9]{64}$/D', $batch->projectionFingerprints[$id])) {
                throw new BatchReplayException('batch_invalidated');
            }
        }
    }

    private function assertPolicy(DiscoveryBatch $batch, CurrentEventContext $context): void
    {
        $policy = $this->policies->current($context);
        if ($policy->version !== $batch->policyVersion || Fingerprint::of($policy) !== $batch->policyFingerprint) { throw new BatchReplayException('batch_invalidated'); }
    }

    /** @return array{array<string,CandidateProjection>,array<string,array>} */
    private function readAll(CandidateRequest $request, DiscoveryBatch $batch): array
    {
        if ($request->targetIds === []) { return [[], []]; }
        $rows = $this->profiles->read($request);
        if (!array_is_list($rows) || count($rows) !== count($request->targetIds)) { throw new BatchReplayException('batch_invalidated'); }
        $profiles = [];
        foreach ($rows as $row) {
            if (!$row instanceof CandidateProjection || $row->targetType !== 'person' || $row->spaceId !== $request->context->spaceId
                || !in_array($row->targetId, $request->targetIds, true) || isset($profiles[$row->targetId])
                || Fingerprint::of($row) !== $batch->projectionFingerprints[$row->targetId]) { throw new BatchReplayException('batch_invalidated'); }
            $profiles[$row->targetId] = $row;
        }
        $relationships = $this->relationships->readCurrent($request);
        if (count($relationships) !== count($request->targetIds)) { throw new BatchReplayException('batch_invalidated'); }
        foreach ($relationships as $id => $row) {
            if (!in_array((string)$id, $request->targetIds, true) || !is_array($row)) { throw new BatchReplayException('batch_invalidated'); }
            $keys = array_keys($row); sort($keys, SORT_STRING);
            if ($keys !== ['blocked', 'friend', 'pending_in', 'pending_out', 'version'] || !is_string($row['version']) || $row['version'] !== $batch->relationshipVersions[$id]) {
                throw new BatchReplayException('batch_invalidated');
            }
            foreach (['blocked', 'friend', 'pending_in', 'pending_out'] as $key) { if (!is_bool($row[$key])) { throw new BatchReplayException('batch_invalidated'); } }
            if ($row['blocked']) { throw new BatchReplayException('batch_invalidated'); }
        }
        // Adapter iteration order does not affect batch order or change detection.
        ksort($profiles, SORT_STRING); ksort($relationships, SORT_STRING);
        return [$profiles, $relationships];
    }

    private function assertCursor(DiscoveryCursor $cursor, string $batchId, DiscoveryBatch $batch, CurrentEventContext $context, string $batchFingerprint): void
    {
        if ($cursor->batchId !== $batchId || $cursor->viewerId !== $context->viewerId || $cursor->spaceId !== $context->spaceId
            || $cursor->contextFingerprint !== Fingerprint::of($context) || $cursor->queryHash !== $batch->queryHash
            || $cursor->policyVersion !== $batch->policyVersion || $cursor->policyFingerprint !== $batch->policyFingerprint
            || $cursor->batchFingerprint !== $batchFingerprint || $cursor->createdAt != $batch->createdAt || $cursor->expiresAt != $batch->expiresAt) {
            throw new BatchReplayException('cursor_invalid');
        }
    }

    private function batchFingerprint(DiscoveryBatch $batch): string
    {
        // DateTime internals are not public object properties; bind canonical timestamps explicitly.
        return Fingerprint::of([
            'context' => $batch->context, 'query_hash' => $batch->queryHash, 'policy_version' => $batch->policyVersion,
            'policy_fingerprint' => $batch->policyFingerprint, 'target_ids' => $batch->targetIds,
            'projection_fingerprints' => $batch->projectionFingerprints, 'relationship_versions' => $batch->relationshipVersions,
            'created_at' => $batch->createdAt->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.u\Z'),
            'expires_at' => $batch->expiresAt->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.u\Z'),
        ]);
    }
}
