<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\application;
use humhub\modules\matcherRecommendation\contracts\ports\{CurrentEventAccess, OrdinaryDiscoverySource, OrdinaryCursorCodec, Clock};
use humhub\modules\matcherRecommendation\domain\browse\{DiscoveryException, OrdinaryDiscoveryQuery};
use humhub\modules\matcherRecommendation\domain\config\Fingerprint;

/** Ordinary discovery is independent of recommendation scoring, indexes, AI, and exposure history. */
final class BrowsePeople
{
    public const POLICY = 'ordinary-discovery-v1';
    public function __construct(private readonly CurrentEventAccess $events, private readonly OrdinaryDiscoverySource $source, private readonly OrdinaryCursorCodec $cursors, private readonly Clock $clock) {}
    public function page(int $viewerId, int $spaceId, OrdinaryDiscoveryQuery $query): array
    {
        $context = $this->events->resolve($viewerId, $spaceId);
        $people = $this->source->readCurrent($context);
        $snapshot = Fingerprint::of($people); $now = $this->clock->now()->getTimestamp();
        $binding = ['viewer_id' => $viewerId, 'space_id' => $spaceId, 'context' => $context->accessVersion,
            'policy' => self::POLICY, 'query' => Fingerprint::of([$query->filters, $query->sort, $query->limit]), 'permissions' => $snapshot];
        $position = 0; $created = $now;
        if ($query->cursor !== null) {
            $cursor = $this->cursors->decode($query->cursor);
            if (array_intersect_key($cursor, $binding) !== $binding || !is_int($cursor['position'] ?? null) || $cursor['position'] < 0
                || !is_int($cursor['created_at'] ?? null) || !is_int($cursor['expires_at'] ?? null)
                || $cursor['expires_at'] !== $cursor['created_at'] + 900 || $cursor['created_at'] > $now) { throw new DiscoveryException('DISCOVERY_CURSOR_INVALID', 'The cursor no longer matches this query, session or permissions.', 409); }
            if ($cursor['expires_at'] <= $now) { throw new DiscoveryException('DISCOVERY_CURSOR_EXPIRED', 'The discovery cursor expired. Start a new list.', 410); }
            $position = $cursor['position']; $created = $cursor['created_at'];
        }
        $matches = [];
        foreach ($people as $card) { $score = $query->match($card); if ($score !== null) { $matches[] = ['card' => $card, 'score' => $score]; } }
        usort($matches, static function (array $a, array $b) use ($query): int {
            $primary = $query->sort === 'recent' ? strcmp($b['card']['updated_at'] ?? '', $a['card']['updated_at'] ?? '') : $b['score'] <=> $a['score'];
            return $primary ?: ($b['card']['owner_id'] <=> $a['card']['owner_id']);
        });
        if ($position > count($matches)) { throw new DiscoveryException('DISCOVERY_CURSOR_INVALID', 'The cursor position is unavailable.', 409); }
        $page = array_slice($matches, $position, $query->limit); $nextPosition = $position + count($page); $more = $nextPosition < count($matches);
        if (Fingerprint::of($this->source->readCurrent($context)) !== $snapshot) { throw new DiscoveryException('DISCOVERY_CHANGED', 'Discovery permissions or profiles changed. Retry the request.', 409); }
        $this->events->assertCurrent($context);
        return ['space_id' => $spaceId, 'target_type' => 'person', 'sort' => $query->sort, 'items' => array_column($page, 'card'),
            'next_cursor' => $more ? $this->cursors->encode($binding + ['position' => $nextPosition, 'created_at' => $created, 'expires_at' => $created + 900]) : null,
            'has_more' => $more, 'exhausted' => !$more, 'limit' => $query->limit];
    }
    public function detail(int $viewerId, int $spaceId, int $ownerId): array
    {
        $context = $this->events->resolve($viewerId, $spaceId); $people = $this->source->readCurrent($context);
        if (!isset($people[$ownerId])) { throw new DiscoveryException('DISCOVERY_PERSON_NOT_FOUND', 'The person is unavailable in the current activity.', 404); }
        $current = $this->source->readCurrent($context); $this->events->assertCurrent($context);
        if (!isset($current[$ownerId])) { throw new DiscoveryException('DISCOVERY_PERSON_NOT_FOUND', 'The person is unavailable in the current activity.', 404); }
        if ($people[$ownerId] !== $current[$ownerId]) { throw new DiscoveryException('DISCOVERY_CHANGED', 'The person changed during the read. Retry the request.', 409); }
        return $current[$ownerId];
    }
}
