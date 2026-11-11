<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\domain;

use humhub\modules\matcherProfile\domain\FieldCatalog;
use humhub\modules\matcherProfile\domain\ProfileException;

/** Pure field projection shared by actual reads and owner-only simulated previews. */
final class VisibilityPolicy
{
    public const VERSION = 's3-2026-11-11';

    public function project(array $profile, string $perspective, string $purpose = 'detail', bool $includePending = false): array
    {
        if (!in_array($perspective, ['owner', 'authenticated', 'friends'], true)
            || !in_array($purpose, ['detail', 'contacts', 'summary', 'discovery'], true)) {
            throw new ProfileException('INVALID_PREVIEW', 'Use a supported profile perspective and purpose.');
        }
        if (in_array($purpose, ['summary', 'discovery'], true)) { $perspective = 'authenticated'; }
        $catalog = FieldCatalog::definitions();
        $attributes = [];
        foreach ($profile['attributes'] ?? [] as $item) {
            $key = $item['key'] ?? '';
            if (!isset($catalog[$key])) { continue; }
            $contact = str_starts_with($key, 'contact_');
            if (($purpose === 'contacts') !== $contact) { continue; }
            if (!$includePending && ($item['confirmation'] ?? null) !== 'confirmed') { continue; }
            $visibility = $item['visibility'] ?? 'private';
            if ($perspective !== 'owner') {
                $canReadFriends = $perspective === 'friends' && !in_array($purpose, ['discovery', 'summary'], true);
                if ($visibility !== 'authenticated' && !($visibility === 'friends' && $canReadFriends)) { continue; }
            }
            // Do not expose storage bindings, provenance, other users' draft state or internal resource metadata.
            $attributes[] = array_intersect_key($item, array_flip(['attribute_id', 'key', 'value', 'visibility', 'confirmation', 'last_confirmed_at', 'display_label', 'sort_order', 'schema_version']));
        }
        $visibleProjects = array_column(array_filter($attributes, static fn(array $item): bool => $item['key'] === 'project'), 'attribute_id');
        foreach ($attributes as &$item) {
            if ($item['key'] === 'portfolio_link' && isset($item['value']['project_ref']) && !in_array($item['value']['project_ref'], $visibleProjects, true)) {
                unset($item['value']['project_ref']);
            }
        }
        unset($item);
        $visibleKeys = array_column($attributes, 'key');
        $result = array_intersect_key($profile, array_flip(['scope', 'space_id', 'revision', 'permission_version', 'schema_version']));
        $result['attributes'] = $attributes;
        $result['field_definitions'] = array_values(array_filter($catalog, static fn(array $field): bool => in_array($field['key'], $visibleKeys, true)));
        $result['policy_version'] = self::VERSION;
        return $result;
    }
}
