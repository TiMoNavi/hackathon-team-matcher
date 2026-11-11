<?php
declare(strict_types=1);

// R0 synthetic contract tests only. No HumHub bootstrap, database, configuration or network.
$moduleRoot = dirname(__DIR__, 2);
spl_autoload_register(static function (string $class) use ($moduleRoot): void {
    $prefix = implode(chr(92), ['humhub', 'modules', 'matcherRecommendation']) . chr(92);
    if (str_starts_with($class, $prefix)) {
        $file = $moduleRoot . '/' . str_replace(chr(92), '/', substr($class, strlen($prefix))) . '.php';
        if (is_file($file)) { require $file; }
    }
});

use humhub\modules\matcherRecommendation\contracts\{ContractShape, CurrentEventContext, QueryIntent, ProjectionVersions, EvidenceRef, CandidateRequest, CandidateProjection};
use humhub\modules\matcherRecommendation\contracts\ports\{CurrentEventAccess, ProfileFieldCatalog, CandidateProjectionReader, ContactEligibilityReader, AuthorizedIdeaReader, IdeaCandidateProjectionReader, CandidateRetriever, QueryInterpreter, CandidateReranker};

$checks = [];
function check(bool $result, string $name): void
{
    global $checks;
    if (!$result) { throw new RuntimeException('FAIL: ' . $name); }
    $checks[] = $name;
}
function rejects(callable $action, string $name, string $expected = InvalidArgumentException::class): void
{
    try { $action(); }
    catch (Throwable $error) {
        check($error instanceof $expected, $name);
        return;
    }
    check(false, $name);
}

$events = new class implements CurrentEventAccess {
    public string $currentVersion = 'membership-1';
    public function resolve(int $viewerId, ?int $requestedSpaceId = null): CurrentEventContext
    {
        if ($viewerId !== 1 || ($requestedSpaceId !== null && $requestedSpaceId !== 7)) {
            throw new RuntimeException('Context denied.');
        }
        return new CurrentEventContext(1, 7, $this->currentVersion, 'event-policy-1');
    }
    public function assertCurrent(CurrentEventContext $context): void
    {
        if ($context->viewerId !== 1 || $context->spaceId !== 7 || $context->accessVersion !== $this->currentVersion || $context->policyVersion !== 'event-policy-1') {
            throw new RuntimeException('Stale or unauthorized context.');
        }
    }
};
$context = $events->resolve(1, 7);
check($context->spaceId === 7, 'server-selected Space accepted');
rejects(fn() => $events->resolve(1, 8), 'requested other Space rejected', RuntimeException::class);
rejects(fn() => $events->assertCurrent(new CurrentEventContext(1, 7, 'forged', 'event-policy-1')), 'DTO construction is not authorization', RuntimeException::class);
rejects(fn() => new CurrentEventContext(0, 7, 'v1', 'p1'), 'invalid actor ID rejected');

$versions = new ProjectionVersions(['global' => ['revision' => 3, 'permission_version' => 1], 'space:7' => ['revision' => 8, 'permission_version' => 2]], 2, 's2-fixture', 5);
check($versions->scopes['global']['revision'] !== $versions->scopes['space:7']['revision'] && $versions->identityVersion === 5, 'global Space and identity versions remain separate');
$evidence = new EvidenceRef('person', '101', 'profile_attribute', 'attribute-fixture-1', 'global', 3, 1);
check($evidence->attributeId() === 'attribute-fixture-1', 'evidence retains stable attribute ID');
$features = ['topics' => ['value' => ['robotics'], 'evidence' => [$evidence]]];
$candidate = new CandidateProjection('person', '101', 7, $versions, $features, ['collaboration_style']);
check($candidate->unknownFeatures === ['collaboration_style'], 'unknown feature stays explicit');
rejects(fn() => new CandidateProjection('person', '102', 7, $versions, $features), 'another candidate evidence rejected');
rejects(fn() => new CandidateProjection('person', '101', 8, $versions, $features), 'cross-Space versions rejected');
$staleEvidence = new EvidenceRef('person', '101', 'profile_attribute', 'attribute-fixture-1', 'global', 2, 1);
rejects(fn() => new CandidateProjection('person', '101', 7, $versions, ['topics' => ['value' => ['robotics'], 'evidence' => [$staleEvidence]]]), 'stale evidence revision rejected');
$stalePermission = new EvidenceRef('person', '101', 'profile_attribute', 'attribute-fixture-1', 'global', 3, 0);
rejects(fn() => new CandidateProjection('person', '101', 7, $versions, ['topics' => ['value' => ['robotics'], 'evidence' => [$stalePermission]]]), 'stale evidence permission version rejected');
rejects(fn() => new CandidateProjection('person', '101', 7, $versions, $features, ['topics']), 'known feature cannot also be unknown');
rejects(fn() => new CandidateProjection('person', '101', 7, $versions, ['topics' => ['value' => null, 'evidence' => [$evidence]]]), 'unknown null cannot masquerade as known evidence');
rejects(fn() => new EvidenceRef('idea', 'idea-1', 'profile_attribute', 'attribute-fixture-1', 'global', 3, 1), 'idea cannot reuse person evidence type');

$hard = ['feature' => 'contribution', 'operator' => 'supply_demand', 'value' => ['backend'], 'strength' => 'hard', 'origin' => 'user_confirmed'];
$query = new QueryIntent('person', [$hard], ['self-attribute-1']);
check($query->conditions[0]['strength'] === 'hard', 'explicit hard requirement retained');
$draft = $hard; $draft['origin'] = 'interpreted_draft';
rejects(fn() => new QueryIntent('person', [$draft]), 'AI draft cannot self-confirm hard requirement');
$draft['strength'] = 'soft';
check((new QueryIntent('person', [$draft]))->conditions[0]['strength'] === 'soft', 'interpreted soft preference retained');
$injected = $hard; $injected['event_id'] = 8;
rejects(fn() => new QueryIntent('person', [$injected]), 'query cannot carry injected activity authority');
rejects(fn() => new QueryIntent('all_users'), 'unknown target type rejected');
$recursive = []; $recursive['self'] =& $recursive;
rejects(fn() => ContractShape::jsonValue($recursive), 'recursive JSON array rejected before recursive walk');
$deep = 'leaf';
for ($i = 0; $i < 520; $i++) { $deep = [$deep]; }
rejects(fn() => ContractShape::jsonValue($deep), 'excessive JSON depth rejected');
rejects(fn() => ContractShape::jsonValue(['object' => new stdClass()]), 'nested object is not plain JSON transport data');

$maxIds = array_map(strval(...), range(100, 299));
check(count((new CandidateRequest($context, 'person', $maxIds))->targetIds) === 200, '200-ID batch accepted');
rejects(fn() => new CandidateRequest($context, 'person', [...$maxIds, '300']), '201-ID batch rejected');
rejects(fn() => new CandidateRequest($context, 'person', ['101', '101']), 'duplicate candidate IDs rejected');
check((new CandidateRequest($context, 'person', []))->targetIds === [], 'empty explicit batch remains empty');

// Fake source and mapping intentionally have no HumHub column names. This is NOT a production P1 adapter.
$catalog = new class implements ProfileFieldCatalog {
    public string $topicSource = 'hobby_codes_v9';
    public int $version = 2;
    public function read(): array
    {
        return ['schema_version' => $this->version, 'fields' => [
            'new_unmapped_field' => ['key' => 'new_unmapped_field', 'scope' => 'global', 'value_schema' => ['type' => 'string'], 'cardinality' => 'one'],
            $this->topicSource => ['key' => $this->topicSource, 'scope' => 'global', 'value_schema' => ['type' => 'array'], 'cardinality' => 'many'],
        ]];
    }
};
$people = new class($events, $catalog, $versions) implements CandidateProjectionReader {
    public bool $available = true;
    public string $fixtureSourceKey = 'hobby_codes_v9';
    public array $bindings = ['topics' => 'hobby_codes_v9'];
    public function __construct(private CurrentEventAccess $events, private ProfileFieldCatalog $catalog, private ProjectionVersions $versions) {}
    public function read(CandidateRequest $request): array
    {
        $this->events->assertCurrent($request->context);
        if (!$this->available) { throw new RuntimeException('Projection dependency unavailable.'); }
        if ($request->targetType !== 'person') { throw new InvalidArgumentException('Person reader requires person target.'); }
        if (!in_array('101', $request->targetIds, true)) { return []; }
        $sourceKey = $this->fixtureSourceKey;
        $raw = [
            ['id' => 'attribute-fixture-1', 'key' => $sourceKey, 'value' => ['robotics'], 'confirmation' => 'confirmed', 'visibility' => 'authenticated'],
            ['id' => 'contact-fixture', 'key' => 'contact_phone', 'value' => 'synthetic-contact', 'confirmation' => 'confirmed', 'visibility' => 'authenticated'],
            ['id' => 'new-field', 'key' => 'new_unmapped_field', 'value' => 'not enabled', 'confirmation' => 'confirmed', 'visibility' => 'authenticated'],
            ['id' => 'private-field', 'key' => $sourceKey, 'value' => ['hidden-topic'], 'confirmation' => 'confirmed', 'visibility' => 'private'],
            ['id' => 'draft-field', 'key' => $sourceKey, 'value' => ['draft-topic'], 'confirmation' => 'draft', 'visibility' => 'authenticated'],
        ];
        $features = [];
        foreach ($raw as $attribute) {
            if ($attribute['confirmation'] !== 'confirmed' || $attribute['visibility'] !== 'authenticated') { continue; }
            foreach ($this->bindings as $logicalKey => $boundKey) {
                if ($attribute['key'] !== $boundKey || !isset($this->catalog->read()['fields'][$boundKey])) { continue; }
                $ref = new EvidenceRef('person', '101', 'profile_attribute', $attribute['id'], 'global', 3, 1);
                $features[$logicalKey] = ['value' => $attribute['value'], 'evidence' => [$ref]];
            }
        }
        return [new CandidateProjection('person', '101', 7, $this->versions, $features)];
    }
};
$request = new CandidateRequest($context, 'person', ['101']);
$first = $people->read($request)[0];
check(array_keys($first->features) === ['topics'], 'purpose allowlist excludes authenticated contacts and unmapped fields');
check($first->features['topics']['value'] === ['robotics'], 'private and draft values excluded by fake projection');
check(array_key_first($catalog->read()['fields']) === 'new_unmapped_field' && !isset($first->features['new_unmapped_field']), 'new catalog field stays disabled regardless of catalog order');
$catalog->topicSource = 'project_theme_tokens_v10'; $catalog->version = 3;
$people->fixtureSourceKey = 'project_theme_tokens_v10';
check($people->read($request)[0]->features === [], 'renamed source is inactive until its binding is explicitly updated');
$people->bindings = ['topics' => 'project_theme_tokens_v10'];
$second = $people->read($request)[0];
check($second->features['topics']['value'] === $first->features['topics']['value'], 'explicit new binding restores the same logical feature');
check($catalog->read()['schema_version'] === 3, 'field catalog schema can change independently');
check($people->read(new CandidateRequest($context, 'person', [])) === [], 'empty ID request never becomes all users');
rejects(fn() => $people->read(new CandidateRequest($context, 'idea', ['idea-1'])), 'person reader rejects idea target');
$people->available = false;
rejects(fn() => $people->read($request), 'dependency failure is not empty success', RuntimeException::class);
$people->available = true; $events->currentVersion = 'membership-2';
rejects(fn() => $people->read($request), 'membership change invalidates old context despite unchanged P1 versions', RuntimeException::class);
$context = $events->resolve(1, 7); $request = new CandidateRequest($context, 'person', ['101']);

$relations = new class($events) implements ContactEligibilityReader {
    public function __construct(private CurrentEventAccess $events) {}
    private function validate(CandidateRequest $request): void
    {
        $this->events->assertCurrent($request->context);
        if ($request->targetType !== 'person') { throw new InvalidArgumentException('Relationship reader requires person target.'); }
    }
    public function readCurrent(CandidateRequest $request): array
    {
        $this->validate($request);
        if (!in_array('101', $request->targetIds, true)) { return []; }
        return ['101' => ['blocked' => false, 'friend' => true, 'pending_in' => false, 'pending_out' => false, 'version' => 'rel-1']];
    }
    public function supportsSentHistory(): bool { return false; }
    public function readSentHistory(CandidateRequest $request): array
    {
        $this->validate($request);
        throw new RuntimeException('Sent-request history unavailable.');
    }
};
check($relations->readCurrent($request)['101']['friend'] === true && !$relations->supportsSentHistory(), 'current relationships remain available without AI-only history');
rejects(fn() => $relations->readSentHistory($request), 'missing history is not an all-false history map', RuntimeException::class);
$ideas = new class($events) implements IdeaCandidateProjectionReader {
    public function __construct(private CurrentEventAccess $events) {}
    public function read(CandidateRequest $request): array
    {
        $this->events->assertCurrent($request->context);
        if ($request->targetType !== 'idea') { throw new InvalidArgumentException('Idea reader requires idea target.'); }
        if (!in_array('idea-1', $request->targetIds, true)) { return []; }
        $versions = new ProjectionVersions(['space:7' => ['revision' => 2, 'permission_version' => 1]], 1, 'idea-policy-1');
        return [new CandidateProjection('idea', 'idea-1', 7, $versions, ['topics' => ['value' => ['robotics'], 'evidence' => [new EvidenceRef('idea', 'idea-1', 'idea_fact', 'idea-theme-1', 'space:7', 2, 1)]]])];
    }
};
check($ideas->read(new CandidateRequest($context, 'idea', ['idea-1']))[0]->targetType === 'idea', 'idea candidates use separate projection and evidence');
rejects(fn() => $ideas->read($request), 'idea reader rejects person target');
check($relations->readCurrent(new CandidateRequest($context, 'person', [])) === [], 'relationship reader preserves empty request');
check($relations->readCurrent(new CandidateRequest($context, 'person', ['999'])) === [], 'relationship reader never returns an unrequested candidate');
check($ideas->read(new CandidateRequest($context, 'idea', ['idea-other'])) === [], 'idea reader never returns an unrequested candidate');
rejects(fn() => $relations->readCurrent(new CandidateRequest($context, 'idea', ['idea-1'])), 'relationship reader rejects idea target');
$otherSpace = new CurrentEventContext(1, 8, 'membership-2', 'event-policy-1');
rejects(fn() => $ideas->read(new CandidateRequest($otherSpace, 'idea', ['idea-1'])), 'idea reader rejects cross-Space context', RuntimeException::class);
rejects(fn() => $relations->readCurrent(new CandidateRequest($otherSpace, 'person', ['101'])), 'relationship reader rejects cross-Space context', RuntimeException::class);
$events->currentVersion = 'membership-3';
rejects(fn() => $ideas->read(new CandidateRequest($context, 'idea', ['idea-1'])), 'idea reader rejects stale access context', RuntimeException::class);
rejects(fn() => $relations->readCurrent($request), 'relationship reader rejects stale access context', RuntimeException::class);

foreach ([CurrentEventAccess::class, ProfileFieldCatalog::class, CandidateProjectionReader::class, ContactEligibilityReader::class, AuthorizedIdeaReader::class, IdeaCandidateProjectionReader::class, CandidateRetriever::class, QueryInterpreter::class, CandidateReranker::class] as $interface) {
    check(interface_exists($interface), 'autoload ' . substr($interface, strrpos($interface, chr(92)) + 1));
}
echo json_encode(['status' => 'passed', 'phase' => 'R0 synthetic contracts only', 'checks' => count($checks), 'database_calls' => 0, 'network_calls' => 0, 'model_calls' => 0, 'production_adapters_executed' => false, 'checks_passed' => $checks], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . PHP_EOL;
