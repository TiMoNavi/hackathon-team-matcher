<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\native;

use humhub\modules\matcherProfile\domain\FieldCatalog;
use humhub\modules\matcherProfile\adapters\persistence\NativeProfileValues;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\user\models\Profile;
use humhub\modules\user\models\User;
use Yii;
use yii\base\Event;
use yii\db\Query;

/** Scoped bridge keeps native form validation and account controls, then versions changed profile values. */
final class NativeEditBridge
{
    private static ?self $active = null;
    private bool $processing = false;
    public function __construct(private int $ownerId, private bool $administrator = false) {}

    public function run(callable $action): mixed
    {
        if (!Yii::$app->request->isPost) { return $action(); }
        if (self::$active !== null) { throw new \LogicException('Native profile editing cannot be nested.'); }
        $module = Yii::$app->getModule('matcher-user-profile');
        $module->getAccessPolicy()->assertWritable();
        $previous = self::$active; self::$active = $this;
        try { return $module->getProfileRepository()->transaction($action); }
        finally { self::$active = $previous; }
    }
    public static function profileBeforeUpdate(Event $event): void
    {
        $profile = $event->sender;
        if (!$profile instanceof Profile) { return; }
        if (self::$active !== null && (int)$profile->user_id === self::$active->ownerId) {
            self::$active->profile($profile); return;
        }
        foreach (FieldCatalog::nativeBindings() as $binding) {
            if ($binding['table'] !== 'profile') { continue; }
            if ($profile->getDirtyAttributes($binding['columns']) !== []) {
                throw new ProfileException('PROFILE_VERSIONED_EDIT_REQUIRED', 'Use the versioned profile editor or create an administrator proposal.', 409);
            }
        }
    }
    public static function userBeforeUpdate(Event $event): void
    {
        $user = $event->sender;
        if (!$user instanceof User) { return; }
        // Native beforeSave supplies the site default even for unrelated account writes.
        $request = Yii::$app->request;
        $post = $request instanceof \yii\web\Request ? $request->post() : [];
        $settingsInput = array_key_exists('timeZone', $post['AccountSettings'] ?? []);
        $explicit = $settingsInput || array_key_exists('time_zone', $post['User'] ?? []);
        if (self::$active !== null && (int)$user->id === self::$active->ownerId && $settingsInput && in_array($post['AccountSettings']['timeZone'], [null, ''], true)) {
            $user->time_zone = null; // Preserve an explicit optional-field clear across native defaulting.
        }
        if (!$user->isAttributeChanged('time_zone')) { return; }
        if (!$explicit && ($user->getOldAttribute('time_zone') === null || $user->getOldAttribute('time_zone') === '') && $user->time_zone === Yii::$app->settings->get('defaultTimeZone')) {
            $user->time_zone = $user->getOldAttribute('time_zone'); return;
        }
        if (self::$active !== null && (int)$user->id === self::$active->ownerId) {
            self::$active->timezone($user); return;
        }
        throw new ProfileException('PROFILE_VERSIONED_EDIT_REQUIRED', 'Use the versioned profile editor to change the stored time zone.', 409);
    }
    public function tokens(): array
    {
        $state = Yii::$app->getModule('matcher-user-profile')->getProfileRepository()->findState($this->ownerId, ProfileScope::global());
        return ['matcher_profile_revision' => (int)($state['revision'] ?? 0), 'matcher_identity_version' => (int)($state['identity_version'] ?? 0)];
    }
    private function profile(Profile $profile): void
    {
        if ($this->processing) { return; }
        $this->processing = true;
        try {
            $values = [];
            $columns = [];
            $nickname = null;
            foreach (FieldCatalog::nativeBindings() as $key => $binding) {
                if ($binding['table'] !== 'profile' || $profile->getDirtyAttributes($binding['columns']) === []) { continue; }
                array_push($columns, ...$binding['columns']);
                $value = $key === 'real_name' ? trim(trim((string)$profile->firstname) . ' ' . trim((string)$profile->lastname)) : $profile->{$binding['columns'][0]};
                if ($key === 'nickname') { $nickname = $value; continue; }
                $values[$key] = $value;
            }
            if ($values !== []) { $this->saveOrdinary($values); }
            if ($nickname !== null) {
                if ($this->administrator) { throw new ProfileException('IDENTITY_OWNER_CONFIRMATION_REQUIRED', 'The account owner updates their display identity.', 422); }
                Yii::$app->getModule('matcher-user-profile')->getIdentityService()->update($this->ownerId, $this->expected('matcher_identity_version'), ['nickname' => $nickname]);
            }
            if ($columns !== []) {
                $fresh = (new Query())->select($columns)->from(Profile::tableName())->where(['user_id' => $this->ownerId])->one();
                foreach ($fresh as $column => $value) { $profile->$column = $value; $profile->setOldAttribute($column, $value); }
            }
        } finally { $this->processing = false; }
    }
    private function timezone(User $user): void
    {
        if ($this->processing) { return; }
        $this->processing = true;
        try {
            $this->saveOrdinary(['timezone' => $user->getAttribute('time_zone')]);
            $fresh = (new Query())->select('time_zone')->from(User::tableName())->where(['id' => $this->ownerId])->scalar();
            $user->time_zone = $fresh; $user->setOldAttribute('time_zone', $fresh);
        } finally { $this->processing = false; }
    }
    private function saveOrdinary(array $values): void
    {
        $module = Yii::$app->getModule('matcher-user-profile');
        $repo = $module->getProfileRepository(); $scope = ProfileScope::global();
        $state = $repo->ensureState($this->ownerId, $scope, gmdate('Y-m-d H:i:s'));
        if ((int)$state['revision'] !== $this->expected('matcher_profile_revision')) { throw new ProfileException('PROFILE_VERSION_CONFLICT', 'The profile has changed; reload before saving.', 409); }
        $attributes = $repo->currentAttributes($state['id']);
        $operations = [];
        foreach ($values as $binding => $value) {
            $key = $binding === 'primary_portfolio_link' ? 'portfolio_link' : $binding;
            $existing = null;
            if ($binding === 'primary_portfolio_link') {
                $nativeId = (new Query())->select('attribute_id')->from('{{%matcher_profile_attribute}}')->where(['state_id' => $state['id'], 'native_binding' => $binding])->scalar();
                foreach ($attributes as $attribute) { if ($attribute['attribute_id'] === $nativeId) { $existing = $attribute; break; } }
            } else { foreach ($attributes as $attribute) { if ($attribute['key'] === $key) { $existing = $attribute; break; } } }
            if ($value === null || $value === '') {
                if ($existing === null) {
                    $raw = (new NativeProfileValues(Yii::$app->db))->all($this->ownerId)[$binding] ?? null;
                    if ($raw !== null && $raw !== '') {
                        // Give an explicitly cleared legacy value a private pending marker so deletion
                        // receives the same stable ID and revision semantics as any other edit.
                        $h = bin2hex(random_bytes(16));
                        $id = substr($h, 0, 8) . '-' . substr($h, 8, 4) . '-4' . substr($h, 13, 3) . '-a' . substr($h, 17, 3) . '-' . substr($h, 20);
                        Yii::$app->db->createCommand()->insert('{{%matcher_profile_attribute}}', [
                            'attribute_id' => $id, 'state_id' => $state['id'], 'scope_key' => 'global', 'field_key' => $key,
                            'storage_kind' => 'native', 'native_binding' => $binding, 'value_json' => null,
                            'visibility' => 'private', 'confirmation' => 'draft', 'schema_version' => FieldCatalog::VERSION,
                        ])->execute();
                        $existing = ['attribute_id' => $id];
                    }
                }
                if ($existing !== null) { $operations[] = ['op' => 'delete', 'attribute_id' => $existing['attribute_id']]; }
                continue;
            }
            if ($binding === 'primary_portfolio_link') { $value = ['url' => $value, 'label' => $existing['value']['label'] ?? '个人主页']; }
            $operation = ['key' => $key, 'value' => $value];
            if ($existing !== null) { $operation['attribute_id'] = $existing['attribute_id']; }
            $operations[] = $operation;
        }
        $actor = (int)Yii::$app->user->id;
        if ($operations === []) { return; }
        $service = $module->getProfileService();
        if ($this->administrator) { $service->adminProposal($actor, $this->ownerId, $scope, $operations); return; }
        $draft = $service->startDraft($actor, $this->ownerId, $scope, 'native_edit', false);
        $draft = $service->updateDraft($actor, $this->ownerId, $scope, $draft['id'], (int)$draft['draft_version'], $operations);
        $service->confirmDraft($actor, $this->ownerId, $scope, $draft['id'], (int)$draft['draft_version'], (int)$state['revision']);
    }
    private function expected(string $name): int
    {
        $value = Yii::$app->request->post($name);
        if ((!is_int($value) && !is_string($value)) || !preg_match('/^\d+$/D', (string)$value)) { throw new ProfileException('PROFILE_VERSION_REQUIRED', 'Reload the profile form before saving.', 409); }
        return (int)$value;
    }
}
