<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\persistence;

use humhub\modules\matcherProfile\domain\{DiscoveryProfileBatchRequest, FieldCatalog, ProfileException};
use humhub\modules\matcherProfile\domain\ports\DiscoveryProfileBatchSource;
use yii\db\{Connection, Expression, Query};

/** Three bounded SELECTs; no single-person service, write, snapshot cache or external transaction. */
final class SqlDiscoveryProfileBatchSource implements DiscoveryProfileBatchSource
{
    public function __construct(private readonly Connection $db) {}

    public function read(DiscoveryProfileBatchRequest $request): array
    {
        if ($request->ownerIds === []) { return ['schema_version' => FieldCatalog::VERSION, 'profiles' => []]; }
        if ($this->db->getTransaction()?->isActive) {
            throw new ProfileException('PROFILE_BATCH_TRANSACTION_UNSUPPORTED', 'Batch profile reads require a fresh authoritative connection.', 503);
        }
        $logging = $this->db->enableLogging; $profiling = $this->db->enableProfiling;
        $this->db->enableLogging = false; $this->db->enableProfiling = false;
        try {
            return $this->db->useMaster(fn(Connection $db): array => $db->noCache(function () use ($request): array {
                $before = $this->states($request);
                $rows = $this->attributes($request);
                $after = $this->states($request);
                if ($before !== $after) { throw new ProfileException('PROFILE_BATCH_CHANGED', 'Profile versions changed during the batch read; obtain a fresh projection.', 409); }
                return $this->project($request, $before, $rows);
            }));
        } catch (ProfileException $error) { throw $error; }
        catch (\Throwable) {
            // Yii errors may embed SQL and bound values. Do not retain the previous exception.
            throw new ProfileException('PROFILE_BATCH_UNAVAILABLE', 'The batch profile source is unavailable.', 503);
        } finally {
            $this->db->enableLogging = $logging; $this->db->enableProfiling = $profiling;
        }
    }

    private function states(DiscoveryProfileBatchRequest $request): array
    {
        return (new Query())->select(['id', 'user_id', 'scope_key', 'space_id', 'revision', 'permission_version', 'identity_version', 'current_revision_id'])
            ->from('{{%matcher_profile_state}}')->where(['user_id' => $request->ownerIds, 'scope_key' => ['global', 'space:' . $request->spaceId]])
            ->orderBy(['user_id' => SORT_ASC, 'scope_key' => SORT_ASC, 'id' => SORT_ASC])->noCache()->all($this->db);
    }

    private function attributes(DiscoveryProfileBatchRequest $request): array
    {
        $columns = ['owner_id' => 's.user_id', 'state_id' => 's.id', 'scope_key' => 's.scope_key',
            'attribute_id' => 'a.attribute_id', 'key' => 'a.field_key', 'storage_kind' => 'a.storage_kind', 'native_binding' => 'a.native_binding',
            'value_json' => new Expression("CASE WHEN [[a.storage_kind]] = 'inline' THEN [[a.value_json]] ELSE NULL END"),
            'visibility' => 'a.visibility', 'confirmation' => 'a.confirmation', 'last_confirmed_at' => 'a.last_confirmed_at',
            'display_label' => 'a.display_label', 'sort_order' => 'a.sort_order', 'schema_version' => 'a.schema_version'];
        $catalog = FieldCatalog::definitions(); $native = FieldCatalog::nativeBindings(); $joins = [];
        foreach ($request->sourceKeys as $key) {
            $field = $catalog[$key];
            foreach (array_filter([$field['native_binding'], $field['alternate_native_binding'] ?? null]) as $bindingKey) {
                $binding = $native[$bindingKey];
                $alias = $binding['table'] === 'profile' ? 'p' : 'u'; $joins[$alias] = $binding['table'];
                foreach ($binding['columns'] as $index => $column) {
                    $parameter = ':batch_native_' . $bindingKey . '_' . $index;
                    $columns['native_' . $bindingKey . '_' . $index] = new Expression(
                        "CASE WHEN [[a.storage_kind]] = 'native' AND [[a.native_binding]] = " . $parameter . ' AND [[a.field_key]] = ' . $parameter . '_key THEN [[' . $alias . '.' . $column . ']] ELSE NULL END',
                        [$parameter => $bindingKey, $parameter . '_key' => $key],
                    );
                }
            }
        }
        $query = (new Query())->select($columns)->from(['s' => '{{%matcher_profile_state}}'])
            ->innerJoin(['a' => '{{%matcher_profile_attribute}}'], '[[a.state_id]] = [[s.id]] AND [[a.scope_key]] = [[s.scope_key]]')
            ->where(['s.user_id' => $request->ownerIds, 's.scope_key' => ['global', 'space:' . $request->spaceId],
                'a.field_key' => $request->sourceKeys, 'a.confirmation' => 'confirmed', 'a.visibility' => 'authenticated'])
            ->andWhere(['not', ['a.last_confirmed_at' => null]])
            ->orderBy(['s.user_id' => SORT_ASC, 's.scope_key' => SORT_ASC, 'a.sort_order' => SORT_ASC, 'a.attribute_id' => SORT_ASC]);
        foreach ($joins as $alias => $table) {
            $query->leftJoin([$alias => '{{%' . $table . '}}'], '[[' . $alias . '.' . ($table === 'profile' ? 'user_id' : 'id') . ']] = [[s.user_id]]');
        }
        return $query->noCache()->all($this->db);
    }

    private function project(DiscoveryProfileBatchRequest $request, array $states, array $rows): array
    {
        $profiles = []; $stateIds = [];
        foreach ($request->ownerIds as $id) {
            $empty = ['revision' => 0, 'permission_version' => 0, 'attributes' => []];
            $profiles[$id] = ['scopes' => ['global' => $empty, 'space:' . $request->spaceId => $empty], 'identity_version' => 0];
        }
        foreach ($states as $state) {
            $id = (int)$state['user_id']; $scope = $state['scope_key'];
            if (!isset($profiles[$id]['scopes'][$scope]) || isset($stateIds[$id][$scope])
                || ($scope === 'global' ? $state['space_id'] !== null : (int)$state['space_id'] !== $request->spaceId)) { self::invalid(); }
            $revision = self::version($state['revision']); $permission = self::version($state['permission_version']);
            $identity = self::version($state['identity_version']);
            $stateIds[$id][$scope] = $state['id'];
            $profiles[$id]['scopes'][$scope]['revision'] = $revision;
            $profiles[$id]['scopes'][$scope]['permission_version'] = $permission;
            if ($scope === 'global') { $profiles[$id]['identity_version'] = $identity; }
            elseif ($identity !== 0) { self::invalid(); }
        }
        $catalog = FieldCatalog::definitions();
        foreach ($rows as $row) {
            $id = (int)$row['owner_id']; $scope = $row['scope_key']; $key = $row['key'];
            $field = $catalog[$key] ?? null;
            if ($field === null || ($stateIds[$id][$scope] ?? null) !== $row['state_id']
                || ($field['scope'] === 'global') !== ($scope === 'global')) { self::invalid(); }
            if ($row['storage_kind'] === 'inline' && $field['native_binding'] === null && $row['native_binding'] === null) {
                $value = $row['value_json'] === null ? null : json_decode($row['value_json'], true, 512, JSON_THROW_ON_ERROR);
            } elseif ($row['storage_kind'] === 'native' && $scope === 'global'
                && in_array($row['native_binding'], array_filter([$field['native_binding'], $field['alternate_native_binding'] ?? null]), true)) {
                $binding = $row['native_binding'];
                $value = $row['native_' . $binding . '_0'];
                if ($binding === 'real_name') { $value = trim(trim((string)$value) . ' ' . trim((string)$row['native_real_name_1'])); }
                if ($binding === 'primary_portfolio_link' && $value !== null) { $value = ['url' => $value, 'label' => $row['display_label'] ?? '个人主页']; }
            } else { self::invalid(); }
            $profiles[$id]['scopes'][$scope]['attributes'][] = [
                'attribute_id' => $row['attribute_id'], 'key' => $key, 'value' => $value,
                'visibility' => $row['visibility'], 'confirmation' => $row['confirmation'], 'last_confirmed_at' => $row['last_confirmed_at'],
                'display_label' => $row['display_label'], 'sort_order' => (int)$row['sort_order'], 'schema_version' => self::version($row['schema_version']),
            ];
        }
        return ['schema_version' => FieldCatalog::VERSION, 'profiles' => $profiles];
    }

    private static function version(mixed $value): int
    {
        if ((!is_int($value) && (!is_string($value) || !preg_match('/^(0|[1-9][0-9]*)$/D', $value)))
            || filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]) === false) { self::invalid(); }
        return (int)$value;
    }

    private static function invalid(): never
    {
        throw new ProfileException('PROFILE_BATCH_UNAVAILABLE', 'The batch profile source contains inconsistent metadata.', 503);
    }
}
