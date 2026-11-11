<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\native;
use humhub\modules\matcherRecommendation\contracts\CandidateRequest;
use humhub\modules\matcherRecommendation\contracts\ports\{ContactEligibilityReader, CurrentEventAccess};
use humhub\modules\matcherRecommendation\domain\config\Fingerprint;
use humhub\modules\friendship\models\Friendship;
use yii\db\Connection;

/** Current native facts only. Friendship deletes cancelled/declined relations and is not a history ledger. */
final class NativeContactEligibilityReader implements ContactEligibilityReader
{
    private readonly NativeEligibilityQuery $native;

    public function __construct(Connection $db, private readonly CurrentEventAccess $events)
    {
        $this->native = new NativeEligibilityQuery($db);
    }

    public function readCurrent(CandidateRequest $request): array
    {
        $this->validate($request);
        $this->events->assertCurrent($request->context);
        if ($request->targetIds === []) { return []; }
        // One SQL statement observes current eligibility, blocks and both directions of friendship together.
        $query = $this->native->candidateQuery($request->context, $request->targetIds, false)
            ->leftJoin(['fo' => Friendship::tableName()], '[[fo.user_id]] = [[v.id]] AND [[fo.friend_user_id]] = [[u.id]]')
            ->leftJoin(['fi' => Friendship::tableName()], '[[fi.user_id]] = [[u.id]] AND [[fi.friend_user_id]] = [[v.id]]')
            ->addSelect(['outgoing_id' => 'fo.id', 'outgoing_created_at' => 'fo.created_at', 'incoming_id' => 'fi.id', 'incoming_created_at' => 'fi.created_at']);
        $rows = $this->native->run($query);
        $result = [];
        foreach ($rows as $row) {
            $id = (string)$row['id'];
            if (!in_array($id, $request->targetIds, true) || isset($result[$id])) { throw new NativeAccessException('dependency_unavailable'); }
            $outgoing = $row['outgoing_id'] !== null; $incoming = $row['incoming_id'] !== null;
            $result[$id] = [
                'blocked' => $row['blocked_out'] !== null || $row['blocked_in'] !== null || $row['blocked_space'] !== null,
                'friend' => $outgoing && $incoming,
                'pending_in' => $incoming && !$outgoing,
                'pending_out' => $outgoing && !$incoming,
                // A current-facts fingerprint, never a claim to native monotonic history/version support.
                'version' => 'native-relationship:' . Fingerprint::of(['access' => $request->context->accessVersion, 'facts' => $row]),
            ];
        }
        if (count($result) !== count($request->targetIds)) { throw new NativeAccessException('candidate_access_revoked'); }
        $this->events->assertCurrent($request->context);
        $ordered = [];
        foreach ($request->targetIds as $id) { $ordered[$id] = $result[$id]; }
        return $ordered;
    }

    public function supportsSentHistory(): bool { return false; }

    public function readSentHistory(CandidateRequest $request): array
    {
        $this->validate($request);
        $this->events->assertCurrent($request->context);
        throw new NativeAccessException('unsupported_history');
    }

    private function validate(CandidateRequest $request): void
    {
        if ($request->targetType !== 'person' || in_array((string)$request->context->viewerId, $request->targetIds, true)) {
            throw new NativeAccessException('invalid_request');
        }
        NativeEligibilityQuery::assertPersonIds($request->targetIds);
    }
}
