<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\browse;
use humhub\modules\matcherRecommendation\contracts\CurrentEventContext;
use humhub\modules\matcherRecommendation\contracts\ports\{CurrentEventAccess, OrdinaryDiscoverySource};
use humhub\modules\matcherRecommendation\adapters\native\NativeEligibilityQuery;
use humhub\modules\matcherRecommendation\domain\browse\DiscoveryException;
use humhub\modules\matcherRecommendation\domain\config\Fingerprint;
use humhub\modules\matcherPrivacy\domain\DiscoveryFieldPolicy;
use humhub\modules\friendship\models\Friendship;
use yii\db\Connection;

/** Complete opt-in candidate set, at most 2,000; P8/P1 calls are chunks of 200, never per-person SQL. */
final class NativeOrdinaryDiscoverySource implements OrdinaryDiscoverySource
{
    public const MAX_PEOPLE = 2000;
    private readonly \Closure $profiles;
    private readonly \Closure $identities;
    private readonly NativeEligibilityQuery $native;
    public function __construct(Connection $db, private readonly CurrentEventAccess $events, callable $profiles, callable $identities)
    { $this->native = new NativeEligibilityQuery($db); $this->profiles = \Closure::fromCallable($profiles); $this->identities = \Closure::fromCallable($identities); }

    public function readCurrent(CurrentEventContext $context): array
    {
        $this->events->assertCurrent($context); $rows = $this->nativeRows($context);
        if (count($rows) > self::MAX_PEOPLE) { throw new DiscoveryException('DISCOVERY_CAPACITY_EXCEEDED', 'This activity exceeds the supported 2,000 discoverable people. No candidates were truncated.', 503); }
        $byId = []; foreach ($rows as $row) { $id = (int)$row['id']; if (isset($byId[$id])) { $this->unavailable(); } $byId[$id] = $row; }
        $cards = [];
        foreach (array_chunk(array_keys($byId), 200) as $ids) {
            $batch = ($this->profiles)($context->viewerId, $context->spaceId, $ids, DiscoveryFieldPolicy::KEYS);
            if (!is_array($batch) || !is_array($batch['profiles'] ?? null) || !is_string($batch['policy_version'] ?? null)) { $this->unavailable(); }
            $identities = ($this->identities)($ids);
            if (!is_array($identities)) { $this->unavailable(); }
            foreach ($batch['profiles'] as $id => $profile) {
                if (!is_int($id) || !in_array($id, $ids, true)) { $this->unavailable(); }
                // A confirmed public identity is required to become a discoverable card.
                $identity = $identities[$id] ?? null; if ($identity === null) { continue; }
                if ($profile['identity_version'] !== $identity['identity_version']) { throw new DiscoveryException('DISCOVERY_CHANGED', 'Identity changed during discovery.', 409); }
                $row = $byId[$id]; $out = $row['outgoing_id'] !== null; $in = $row['incoming_id'] !== null;
                $global = $profile['scopes']['global']; $space = $profile['scopes']['space:' . $context->spaceId];
                $dates = [$identity['confirmed_at']];
                foreach (array_merge($global['attributes'], $space['attributes']) as $item) { $dates[] = $item['last_confirmed_at']; }
                $dates = array_map(static fn(string $date): string => (new \DateTimeImmutable($date, new \DateTimeZone('UTC')))->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.u\Z'), $dates);
                sort($dates, SORT_STRING);
                $cards[$id] = ['owner_id' => $id, 'space_id' => $context->spaceId, 'display_name' => $identity['display_name'],
                    'identity_version' => $identity['identity_version'], 'avatar_ref' => $identity['avatar_ref'],
                    'global' => $global, 'space' => $space, 'updated_at' => end($dates),
                    'relationship' => ['state' => $out && $in ? 'friend' : ($out ? 'pending_out' : ($in ? 'pending_in' : 'none')),
                        'friend' => $out && $in, 'pending_out' => $out && !$in, 'pending_in' => $in && !$out,
                        'version' => 'native-relationship:' . Fingerprint::of([$context->accessVersion, $row])],
                    'discovery_version' => (int)$row['discovery_version'], 'privacy_policy_version' => $batch['policy_version']];
            }
        }
        // Includes opt-in changes, blocks, membership loss and real relationship changes.
        if ($this->nativeRows($context) !== $rows) { throw new DiscoveryException('DISCOVERY_CHANGED', 'Activity access or discovery settings changed during the read.', 409); }
        $this->events->assertCurrent($context); ksort($cards, SORT_NUMERIC); return $cards;
    }
    private function nativeRows(CurrentEventContext $context): array
    {
        return $this->native->run($this->native->candidateQuery($context)
            ->innerJoin(['ds' => DiscoverySettingsSchema::TABLE], '[[ds.owner_id]] = [[u.id]] AND [[ds.space_id]] = [[s.id]]')
            ->leftJoin(['fo' => Friendship::tableName()], '[[fo.user_id]] = [[v.id]] AND [[fo.friend_user_id]] = [[u.id]]')
            ->leftJoin(['fi' => Friendship::tableName()], '[[fi.user_id]] = [[u.id]] AND [[fi.friend_user_id]] = [[v.id]]')
            ->addSelect(['discovery_version' => 'ds.version', 'outgoing_id' => 'fo.id', 'outgoing_created_at' => 'fo.created_at', 'incoming_id' => 'fi.id', 'incoming_created_at' => 'fi.created_at'])
            ->andWhere(['ds.discoverable' => 1])->orderBy(['u.id' => SORT_ASC])->limit(self::MAX_PEOPLE + 1));
    }
    private function unavailable(): never { throw new DiscoveryException('DISCOVERY_UNAVAILABLE', 'The authorized discovery projection is unavailable.', 503); }
}
