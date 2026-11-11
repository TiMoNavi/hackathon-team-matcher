<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\persistence;

use humhub\modules\matcherRecommendation\contracts\{ContractShape, CurrentEventContext};
use humhub\modules\matcherRecommendation\domain\{DiscoveryBatch, RulePolicy};
use humhub\modules\matcherRecommendation\domain\config\{Fingerprint, PolicyDraft, PolicyValidator, ReplayReport};

/** Closed versioned envelopes with explicit constructors; never PHP serialization or dynamic classes. */
final class TypedJsonCodec
{
    public const MAX_BYTES = 1048576;
    private const FLAGS = JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;

    public function encodeDraft(#[\SensitiveParameter] PolicyDraft $draft): string
    {
        try { return $this->envelope('policy_draft', $this->draftData($draft)); }
        catch (\Throwable) { throw new StorageException('invalid_data'); }
    }
    public function decodeDraft(#[\SensitiveParameter] string $json): PolicyDraft
    {
        try {
            $data = $this->parse($json, 'policy_draft');
            self::keys($data, ['id', 'revision', 'parameters', 'validated_digest', 'catalog_digest', 'replay']);
            if (!is_string($data['id']) || !is_int($data['revision']) || !is_array($data['parameters'])
                || ($data['validated_digest'] !== null && !is_string($data['validated_digest']))
                || ($data['catalog_digest'] !== null && !is_string($data['catalog_digest']))) { self::bad(); }
            $report = $data['replay'] === null ? null : $this->report($data['replay']);
            $draft = new PolicyDraft($data['id'], $data['revision'], $data['parameters'], $data['validated_digest'], $data['catalog_digest'], $report);
            if ($this->encodeDraft($draft) !== $json) { self::bad(); }
            return $draft;
        } catch (\Throwable) { throw new StorageException('corrupt_storage'); }
    }
    public function encodePolicy(#[\SensitiveParameter] RulePolicy $policy): string
    {
        try {
            self::token($policy->version); PolicyValidator::assertParameters($policy->parameters);
            return $this->envelope('rule_policy', ['version' => $policy->version, 'parameters' => $policy->parameters]);
        } catch (\Throwable) { throw new StorageException('invalid_data'); }
    }
    public function decodePolicy(#[\SensitiveParameter] string $json): RulePolicy
    {
        try {
            $data = $this->parse($json, 'rule_policy'); self::keys($data, ['version', 'parameters']);
            if (!is_string($data['version']) || !is_array($data['parameters'])) { self::bad(); }
            $policy = new RulePolicy($data['version'], $data['parameters']);
            if ($this->encodePolicy($policy) !== $json) { self::bad(); }
            return $policy;
        } catch (\Throwable) { throw new StorageException('corrupt_storage'); }
    }
    public function encodeBatch(#[\SensitiveParameter] DiscoveryBatch $batch): string
    {
        try { return $this->envelope('discovery_batch', $this->batchData($batch)); }
        catch (\Throwable) { throw new StorageException('invalid_data'); }
    }
    public function decodeBatch(#[\SensitiveParameter] string $json): DiscoveryBatch
    {
        try {
            $data = $this->parse($json, 'discovery_batch');
            self::keys($data, ['context', 'query_hash', 'policy_version', 'policy_fingerprint', 'target_ids', 'projection_fingerprints', 'relationship_versions', 'created_at', 'expires_at']);
            self::keys($data['context'], ['viewer_id', 'space_id', 'access_version', 'policy_version']);
            $c = $data['context'];
            if (!is_int($c['viewer_id']) || !is_int($c['space_id']) || !is_string($c['access_version']) || !is_string($c['policy_version'])
                || !is_string($data['query_hash']) || !is_string($data['policy_version']) || ($data['policy_fingerprint'] !== null && !is_string($data['policy_fingerprint']))
                || !is_array($data['target_ids']) || !is_array($data['projection_fingerprints']) || !is_array($data['relationship_versions'])) { self::bad(); }
            $context = new CurrentEventContext($c['viewer_id'], $c['space_id'], $c['access_version'], $c['policy_version']);
            $batch = new DiscoveryBatch($context, $data['query_hash'], $data['policy_version'], $data['target_ids'], $data['projection_fingerprints'], $data['relationship_versions'],
                $this->date($data['created_at']), $this->date($data['expires_at']), $data['policy_fingerprint']);
            if ($this->encodeBatch($batch) !== $json) { self::bad(); }
            return $batch;
        } catch (\Throwable) { throw new StorageException('corrupt_storage'); }
    }

    /** IDs may use the existing contract's tokens; the calling person use case enforces native numeric IDs. */
    private function batchData(DiscoveryBatch $batch): array
    {
        self::token($batch->context->accessVersion); self::token($batch->context->policyVersion); self::token($batch->policyVersion);
        self::hash($batch->queryHash);
        $policyFingerprint = $batch->policyFingerprint ?? null;
        if ($policyFingerprint !== null) { self::hash($policyFingerprint); }
        if ($batch->context->viewerId < 1 || $batch->context->spaceId < 1 || !array_is_list($batch->targetIds) || count($batch->targetIds) > 200
            || $batch->expiresAt <= $batch->createdAt || $batch->expiresAt > $batch->createdAt->setTimezone(new \DateTimeZone('UTC'))->add(new \DateInterval('PT15M'))) { self::bad(); }
        foreach ($batch->targetIds as $id) { self::token($id); }
        if (count(array_unique($batch->targetIds, SORT_STRING)) !== count($batch->targetIds)) { self::bad(); }
        foreach ([$batch->projectionFingerprints, $batch->relationshipVersions] as $versions) {
            if (count($versions) !== count($batch->targetIds)) { self::bad(); }
            foreach ($versions as $id => $version) {
                if (!in_array((string)$id, $batch->targetIds, true)) { self::bad(); }
                self::token($version);
            }
        }
        return [
            'context' => ['viewer_id' => $batch->context->viewerId, 'space_id' => $batch->context->spaceId, 'access_version' => $batch->context->accessVersion, 'policy_version' => $batch->context->policyVersion],
            'query_hash' => $batch->queryHash, 'policy_version' => $batch->policyVersion, 'policy_fingerprint' => $policyFingerprint,
            'target_ids' => $batch->targetIds,
            // Explicit objects retain numeric-key maps and the empty-map shape across JSON.
            'projection_fingerprints' => (object)$batch->projectionFingerprints, 'relationship_versions' => (object)$batch->relationshipVersions,
            'created_at' => $this->dateData($batch->createdAt), 'expires_at' => $this->dateData($batch->expiresAt),
        ];
    }
    private function draftData(PolicyDraft $draft): array
    {
        self::token($draft->id);
        if ($draft->revision < 1 || $draft->revision > 2147483647) { self::bad(); }
        ContractShape::jsonValue($draft->parameters);
        if (($draft->validatedDigest === null) !== ($draft->catalogDigest === null)) { self::bad(); }
        if ($draft->validatedDigest !== null) {
            self::hash($draft->validatedDigest); self::hash($draft->catalogDigest);
            if ($draft->validatedDigest !== $draft->digest()) { self::bad(); }
        }
        $replay = null;
        if ($draft->replay !== null) {
            $replay = $this->reportData($draft->replay);
            if ($draft->validatedDigest === null || $draft->replay->draftId !== $draft->id || $draft->replay->draftRevision !== $draft->revision
                || $draft->replay->policyDigest !== $draft->digest() || $draft->replay->catalogDigest !== $draft->catalogDigest) { self::bad(); }
        }
        return ['id' => $draft->id, 'revision' => $draft->revision, 'parameters' => $draft->parameters, 'validated_digest' => $draft->validatedDigest, 'catalog_digest' => $draft->catalogDigest, 'replay' => $replay];
    }
    private function reportData(ReplayReport $report): array
    {
        self::token($report->draftId); self::token($report->suiteVersion);
        self::hash($report->policyDigest); self::hash($report->catalogDigest); self::hash($report->suiteDigest);
        if ($report->draftRevision < 1 || $report->draftRevision > 2147483647 || !array_is_list($report->assertions) || $report->assertions === [] || count($report->assertions) > 1000) { self::bad(); }
        $seen = [];
        foreach ($report->assertions as $assertion) {
            self::keys($assertion, ['id', 'passed', 'qualifies', 'score', 'reason_count', 'error']); self::token($assertion['id']);
            if (isset($seen[$assertion['id']]) || !is_bool($assertion['passed']) || (!is_bool($assertion['qualifies']) && $assertion['qualifies'] !== null)
                || !is_int($assertion['reason_count']) || $assertion['reason_count'] < 0 || $assertion['reason_count'] > 4096
                || !in_array($assertion['error'], [null, 'evaluation_failed'], true)) { self::bad(); }
            $score = $assertion['score'];
            if ($score !== null && ((!is_float($score) && !is_int($score)) || !is_finite((float)$score) || $score < 0 || $score > 1)) { self::bad(); }
            if ($assertion['error'] === null && ($score === null || $assertion['qualifies'] === null)) { self::bad(); }
            if ($assertion['error'] !== null && ($assertion['passed'] || $score !== null || $assertion['qualifies'] !== null || $assertion['reason_count'] !== 0)) { self::bad(); }
            $seen[$assertion['id']] = true;
        }
        return ['draft_id' => $report->draftId, 'draft_revision' => $report->draftRevision, 'policy_digest' => $report->policyDigest, 'catalog_digest' => $report->catalogDigest, 'suite_version' => $report->suiteVersion, 'suite_digest' => $report->suiteDigest, 'assertions' => $report->assertions];
    }
    private function report(mixed $data): ReplayReport
    {
        self::keys($data, ['draft_id', 'draft_revision', 'policy_digest', 'catalog_digest', 'suite_version', 'suite_digest', 'assertions']);
        foreach (['draft_id', 'policy_digest', 'catalog_digest', 'suite_version', 'suite_digest'] as $key) { if (!is_string($data[$key])) { self::bad(); } }
        if (!is_int($data['draft_revision']) || !is_array($data['assertions'])) { self::bad(); }
        return new ReplayReport($data['draft_id'], $data['draft_revision'], $data['policy_digest'], $data['catalog_digest'], $data['suite_version'], $data['suite_digest'], $data['assertions']);
    }
    private function dateData(\DateTimeImmutable $date): array
    {
        $iso = $date->format('Y-m-d\TH:i:s.uP'); $zone = $date->getTimezone()->getName();
        if (!preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}[+-]\d{2}:\d{2}$/D', $iso) || strlen($zone) > 128) { self::bad(); }
        return ['iso' => $iso, 'timezone' => $zone];
    }
    private function date(mixed $data): \DateTimeImmutable
    {
        self::keys($data, ['iso', 'timezone']);
        if (!is_string($data['iso']) || !is_string($data['timezone']) || strlen($data['iso']) > 40 || strlen($data['timezone']) > 128) { self::bad(); }
        $date = \DateTimeImmutable::createFromFormat('!Y-m-d\TH:i:s.uP', $data['iso']);
        $errors = \DateTimeImmutable::getLastErrors();
        if (!$date || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))) { self::bad(); }
        $date = $date->setTimezone(new \DateTimeZone($data['timezone']));
        if ($this->dateData($date) !== $data) { self::bad(); }
        return $date;
    }
    private function envelope(string $kind, array $value): string
    {
        $json = json_encode(['schema_version' => 1, 'kind' => $kind, 'value' => $value], self::FLAGS, 64);
        if (strlen($json) > self::MAX_BYTES) { self::bad(); }
        return $json;
    }
    private function parse(string $json, string $kind): array
    {
        if ($json === '' || strlen($json) > self::MAX_BYTES) { self::bad(); }
        $data = json_decode($json, true, 64, JSON_THROW_ON_ERROR);
        self::keys($data, ['schema_version', 'kind', 'value']);
        if ($data['schema_version'] !== 1 || $data['kind'] !== $kind || !is_array($data['value'])) { self::bad(); }
        return $data['value'];
    }
    private static function keys(mixed $value, array $expected): void
    {
        if (!is_array($value)) { self::bad(); }
        $keys = array_keys($value); sort($keys, SORT_STRING); sort($expected, SORT_STRING);
        if ($keys !== $expected) { self::bad(); }
    }
    public static function token(#[\SensitiveParameter] mixed $value): void
    {
        if (!is_string($value) || strlen($value) > 128) { self::bad(); }
        ContractShape::token($value);
    }
    private static function hash(mixed $value): void
    {
        if (!is_string($value) || !preg_match('/^[a-f0-9]{64}$/D', $value)) { self::bad(); }
    }
    private static function bad(): never { throw new \InvalidArgumentException('Invalid typed storage value.'); }

    /** Unkeyed checksum detects accidental corruption; it is not protection from a privileged DB writer. */
    public static function verifiedPayload(#[\SensitiveParameter] array $row): string
    {
        $json = $row['payload_json'] ?? null; $digest = $row['payload_digest'] ?? null;
        if (!is_string($json) || strlen($json) > self::MAX_BYTES || !is_string($digest) || !preg_match('/^[a-f0-9]{64}$/D', $digest)
            || !hash_equals($digest, hash('sha256', $json))) { throw new StorageException('corrupt_storage'); }
        return $json;
    }
}
