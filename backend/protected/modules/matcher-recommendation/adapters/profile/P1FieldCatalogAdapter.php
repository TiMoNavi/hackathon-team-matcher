<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\adapters\profile;
use humhub\modules\matcherRecommendation\contracts\ContractShape;
use humhub\modules\matcherRecommendation\contracts\ports\ProfileFieldCatalog;

/**
 * Explicit bridge to P1's public metadata API. The composition root supplies an already initialized
 * Module::getFieldCatalog callable, or an equivalent side-effect-free public FieldCatalog reader.
 * Construction does not initialize P1, read configuration, or query profile storage.
 */
final class P1FieldCatalogAdapter implements ProfileFieldCatalog
{
    private readonly \Closure $readCatalog;
    public function __construct(callable $readCatalog) { $this->readCatalog = \Closure::fromCallable($readCatalog); }

    public function read(): array
    {
        // A dependency failure propagates. It must not turn into an apparently valid empty directory.
        $source = ($this->readCatalog)();
        if (!is_array($source) || !isset($source['schema_version'], $source['fields']) || !is_int($source['schema_version']) || $source['schema_version'] < 1 || !is_array($source['fields']) || count($source['fields']) > 1024) { throw new \UnexpectedValueException('P1 returned an invalid field directory.'); }
        $fields = [];
        foreach ($source['fields'] as $key => $field) {
            if (!is_string($key) || !preg_match('/^[a-z][a-z0-9_]{0,63}$/D', $key) || !is_array($field)) { throw new \UnexpectedValueException('P1 returned an invalid ordinary field entry.'); }
            // Identity and relation metadata are deliberately outside the ordinary-profile directory.
            if (isset($field['kind']) && $field['kind'] !== 'profile') { continue; }
            if (($field['key'] ?? null) !== $key || !in_array($field['scope'] ?? null, ['global', 'event'], true) || !in_array($field['cardinality'] ?? null, ['one', 'many'], true) || !isset($field['value_schema']) || !is_array($field['value_schema'])) { throw new \UnexpectedValueException('P1 ordinary field shape is incompatible.'); }
            ContractShape::jsonValue($field['value_schema']);
            // Unbound new schema dialects remain metadata; the strict binding validator decides support.
            // Never copy native_binding, storage_kind, SQL columns, identities, relations or profile values.
            $fields[$key] = ['key' => $key, 'scope' => $field['scope'], 'cardinality' => $field['cardinality'], 'value_schema' => $field['value_schema']];
        }
        return ['schema_version' => $source['schema_version'], 'fields' => $fields];
    }
}
