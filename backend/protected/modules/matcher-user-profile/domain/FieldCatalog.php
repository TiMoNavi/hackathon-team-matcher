<?php
declare(strict_types=1);

namespace humhub\modules\matcherProfile\domain;

/** Versioned, framework-independent field definitions. No storage or AI side effects. */
final class FieldCatalog
{
    public const VERSION = 2;
    public const VISIBILITIES = ['authenticated', 'friends', 'private'];
    public const AGE_RANGES = [
        'under_18' => '18 岁以下', '18_24' => '18–24 岁', '25_34' => '25–34 岁',
        '35_44' => '35–44 岁', '45_54' => '45–54 岁', '55_plus' => '55 岁及以上',
    ];
    public const MBTI_TYPES = [
        'INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP',
        'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP',
    ];

    /** Native profile column registration metadata; concrete fieldType classes belong to adapters. */
    public static function nativeFields(): array
    {
        $fields = [
            'matcher_nickname' => ['label' => '昵称', 'field_type' => 'Text', 'min_length' => 2, 'max_length' => 32],
            'matcher_age_range' => ['label' => '年龄段', 'field_type' => 'Select', 'options' => self::AGE_RANGES],
            'matcher_mbti' => ['label' => 'MBTI（本人自述）', 'field_type' => 'Select', 'options' => array_combine(self::MBTI_TYPES, self::MBTI_TYPES)],
            'matcher_seeking' => ['label' => '长期合作期待', 'field_type' => 'TextArea', 'max_length' => 1000],
        ];
        foreach ($fields as $name => &$definition) {
            $definition += ['internal_name' => $name, 'min_length' => null, 'max_length' => null, 'options' => []];
        }
        return $fields;
    }

    public static function nativeBindings(): array
    {
        return [
            'nickname' => ['table' => 'profile', 'columns' => ['matcher_nickname']],
            'age_range' => ['table' => 'profile', 'columns' => ['matcher_age_range']],
            'mbti' => ['table' => 'profile', 'columns' => ['matcher_mbti']],
            'seeking' => ['table' => 'profile', 'columns' => ['matcher_seeking']],
            'headline' => ['table' => 'profile', 'columns' => ['title']],
            'bio' => ['table' => 'profile', 'columns' => ['about']],
            'real_name' => ['table' => 'profile', 'columns' => ['firstname', 'lastname']],
            'city' => ['table' => 'profile', 'columns' => ['city']],
            'timezone' => ['table' => 'user', 'columns' => ['time_zone']],
            'primary_portfolio_link' => ['table' => 'profile', 'columns' => ['url']],
            'contact_phone' => ['table' => 'profile', 'columns' => ['mobile']],
        ];
    }

    /** 37 editable profile types. Each repeatable value is one stable attribute, not a packed list. */
    public static function definitions(): array
    {
        // Only immutable code-defined schemas are retained, never profile values or permissions.
        // Returning the array by value keeps nested caller edits isolated via PHP copy-on-write.
        static $definitions = null;
        if ($definitions !== null) { return $definitions; }
        $text = static fn(int $max = 1000, int $min = 1): array => ['type' => 'string', 'minLength' => $min, 'maxLength' => $max];
        $list = static fn(array $items, int $max = 30): array => ['type' => 'array', 'items' => $items, 'maxItems' => $max, 'uniqueItems' => true];
        $object = static fn(array $properties, array $required = []): array => ['type' => 'object', 'properties' => $properties, 'required' => $required, 'additionalProperties' => false];
        $codes = $list($text(64));
        $labelled = $object(['code' => $text(64), 'label' => $text(120), 'note' => $text()], ['code', 'label']);
        $preferences = $object(['codes' => $codes, 'free_text' => $text()]);
        $date = $object(['value' => ['type' => 'string', 'format' => 'partial-date'], 'precision' => ['type' => 'string', 'enum' => ['year', 'month', 'day']]], ['value', 'precision']);
        $url = ['type' => 'string', 'format' => 'http-url', 'maxLength' => 2048];
        $period = ['start' => $date, 'end' => $date];
        $fields = [];
        $add = static function (string $key, string $label, array $schema, string $scope = 'global', bool $many = false, ?string $binding = null) use (&$fields): void {
            $fields[$key] = [
                'key' => $key, 'label' => $label, 'scope' => $scope, 'kind' => 'profile',
                'schema_version' => self::VERSION, 'value_schema' => $schema,
                'cardinality' => $many ? 'many' : 'one', 'max_items' => $many ? 100 : 1,
                'required_when' => [], 'visibility_choices' => self::VISIBILITIES,
                'default_visibility' => 'authenticated', 'native_binding' => $binding,
                'storage_kind' => $binding === null ? 'inline' : 'native',
                'display_order' => count($fields) + 1, 'editable' => true,
            ];
        };
        $add('real_name', '真实姓名', $text(120), binding: 'real_name');
        $add('age_range', '年龄段', ['type' => 'string', 'enum' => array_keys(self::AGE_RANGES)], binding: 'age_range');
        $add('mbti', 'MBTI（本人自述）', ['type' => 'string', 'enum' => self::MBTI_TYPES], binding: 'mbti');
        $add('personality', '性格与做事风格（本人自述）', $object(['traits' => $list($text(40), 10), 'self_description' => $text()]));
        $add('headline', '一句话自述', $text(160), binding: 'headline');
        $add('bio', '自我介绍', $text(10000), binding: 'bio');
        $add('direction', '关注方向', $labelled, many: true);
        $skill = $labelled;
        $skill['properties']['self_level'] = ['type' => 'string', 'enum' => ['learning', 'working', 'proficient', 'expert']];
        $add('skill', '技能', $skill, many: true);
        $add('role', '可贡献角色', $labelled, many: true);
        $add('interest', '兴趣领域', $labelled, many: true);
        $add('seeking', '长期合作期待', $text(), binding: 'seeking');
        $add('language', '沟通语言', $object(['code' => $text(32), 'self_level' => ['type' => 'string', 'enum' => ['basic', 'conversational', 'working', 'fluent', 'native']]], ['code']), many: true);
        $add('city', '常驻城市', $text(255), binding: 'city');
        $add('timezone', '时区', ['type' => 'string', 'format' => 'timezone'], binding: 'timezone');
        $add('contact_wechat', '微信号', ['type' => 'string', 'minLength' => 2, 'maxLength' => 64]);
        $add('contact_wechat_qr', '微信二维码', $object(['file_ref' => $text(255), 'label' => $text(120)], ['file_ref']));
        $add('contact_qq', 'QQ 号', ['type' => 'string', 'minLength' => 5, 'maxLength' => 20]);
        $add('contact_phone', '联系电话', ['type' => 'string', 'minLength' => 5, 'maxLength' => 32], binding: 'contact_phone');
        $add('contact_email', '联系邮箱', ['type' => 'string', 'format' => 'email', 'maxLength' => 254]);
        $add('contact_other', '其他联系方式', $object(['label' => $text(120), 'value' => $text(500)], ['label', 'value']), many: true);
        $add('collaboration_preference', '协作方式', $preferences);
        $add('communication_preference', '沟通习惯', $preferences);
        $add('education', '学业经历', $object(['school' => $text(255), 'major' => $text(255), 'degree' => $text(120), 'summary' => $text(), ...$period], ['school']), many: true);
        $add('project', '项目经历', $object(['title' => $text(255), 'role' => $text(120), 'contribution' => $text(3000), 'tech_codes' => $codes, 'links' => $list($url, 10), 'outcome' => $text(3000), ...$period], ['title']), many: true);
        $add('work_experience', '工作与实习经历', $object(['organization' => $text(255), 'role' => $text(120), 'summary' => $text(3000), ...$period], ['organization']), many: true);
        $add('award', '获奖与成果', $object(['title' => $text(255), 'issuer' => $text(255), 'date' => $date, 'description' => $text(3000)], ['title']), many: true);
        $add('portfolio_link', '作品与证明链接', $object(['url' => $url, 'label' => $text(120), 'project_ref' => $text(64)], ['url', 'label']), many: true);
        $fields['portfolio_link']['alternate_native_binding'] = 'primary_portfolio_link';
        $fields['portfolio_link']['native_url_max_length'] = 255;
        $add('event_goal', '本次活动目标', $preferences, 'event');
        $add('event_seeking', '本次需要的帮助', $object(['role_codes' => $codes, 'skill_codes' => $codes, 'free_text' => $text()]), 'event');
        $add('event_role', '本次承担角色', $labelled, 'event', true);
        $add('event_contribution', '本次提供的帮助', $object(['skill_codes' => $codes, 'free_text' => $text()]), 'event');
        $add('event_time_commitment', '可投入时间', $object(['hours_min' => ['type' => 'number', 'minimum' => 0], 'hours_max' => ['type' => 'number', 'minimum' => 0], 'period' => ['type' => 'string', 'enum' => ['event', 'day', 'week']], 'note' => $text()], ['period']), 'event');
        $add('event_availability', '可以参加的时段', $object(['starts_at' => ['type' => 'string', 'format' => 'date-time'], 'ends_at' => ['type' => 'string', 'format' => 'date-time'], 'timezone' => ['type' => 'string', 'format' => 'timezone']], ['starts_at', 'ends_at', 'timezone']), 'event', true);
        $add('event_collaboration_mode', '本次协作方式', $object(['mode' => ['type' => 'string', 'enum' => ['onsite', 'online', 'hybrid']], 'note' => $text()], ['mode']), 'event');
        $add('event_presence', '本次参与安排', $object(['location_label' => $text(255), 'note' => $text()]), 'event');
        $add('event_contact_preference', '本次沟通偏好', $preferences, 'event');
        $add('event_constraint', '本次协作说明', $text(), 'event');
        return $definitions = $fields;
    }

    public static function identities(): array
    {
        return [
            'nickname' => ['key' => 'nickname', 'label' => '昵称', 'kind' => 'identity', 'scope' => 'global', 'value_schema' => ['type' => 'string', 'minLength' => 2, 'maxLength' => 32], 'native_binding' => 'nickname', 'required_when' => ['confirm_identity', 'social_action'], 'version_field' => 'identity_version'],
            'avatar_ref' => ['key' => 'avatar_ref', 'label' => '头像', 'kind' => 'identity', 'scope' => 'global', 'value_schema' => ['type' => 'string', 'maxLength' => 255], 'resource' => 'native_avatar', 'representation' => 'opaque_resource_reference', 'required_when' => [], 'version_field' => 'identity_version'],
        ];
    }

    /** Read-only relations require a permission-filtered adapter; they are never accepted as editable fields. */
    public static function relations(): array
    {
        return [
            'idea_groups' => ['kind' => 'relation', 'editable' => false, 'source' => 'IdeaActivity -> Messenger Message', 'summary_source' => 'idea_description', 'adapter_status' => 'optional_privacy_capability'],
            'activities' => ['kind' => 'relation', 'editable' => false, 'source' => 'Space + verified Membership', 'summary_source' => 'space.description', 'adapter_status' => 'privacy_capability'],
        ];
    }

    public static function get(string $key): array
    {
        return self::definitions()[$key] ?? self::identities()[$key] ?? throw new \InvalidArgumentException('Unknown editable field: ' . $key);
    }

    /** Null is an unset optional input here. Persistence and explicit deletion semantics belong to S2. */
    public static function validate(string $key, mixed $value, bool $forConfirmation = true): array
    {
        $field = self::get($key);
        if ($value === null) {
            return $forConfirmation && $key === 'nickname' ? ['nickname is required to confirm identity'] : [];
        }
        $errors = ValueValidator::validate($value, $field['value_schema'], $key, $forConfirmation);
        if ($errors !== []) {
            return $errors;
        }
        if ($key === 'nickname' && preg_match('/[\x00-\x1F\x7F]/u', $value)) {
            $errors[] = 'nickname must not contain control characters';
        }
        if ($key === 'contact_phone' && (!preg_match('/^\+?[0-9][0-9 ()-]{3,30}$/D', $value) || strlen(preg_replace('/[^0-9]/', '', $value)) < 5)) {
            $errors[] = 'contact_phone has invalid phone format';
        }
        if ($key === 'contact_qq' && !preg_match('/^[1-9][0-9]{4,19}$/D', $value)) {
            $errors[] = 'contact_qq must be a 5 to 20 digit account number';
        }
        if (in_array($key, ['contact_wechat', 'contact_qq', 'contact_phone', 'contact_email'], true) && preg_match('/[\x00-\x1F\x7F]/u', $value)) {
            $errors[] = $key . ' must not contain control characters';
        }
        if ($key === 'event_time_commitment' && isset($value['hours_min'], $value['hours_max']) && $value['hours_min'] > $value['hours_max']) {
            $errors[] = 'hours_min must not exceed hours_max';
        }
        if ($key === 'event_time_commitment' && isset($value['period']) && $value['period'] === 'day' && max($value['hours_min'] ?? 0, $value['hours_max'] ?? 0) > 24) {
            $errors[] = 'daily commitment must not exceed 24 hours';
        }
        if ($key === 'event_time_commitment' && isset($value['period']) && $value['period'] === 'week' && max($value['hours_min'] ?? 0, $value['hours_max'] ?? 0) > 168) {
            $errors[] = 'weekly commitment must not exceed 168 hours';
        }
        if ($key === 'personality' && $forConfirmation && empty($value['traits']) && trim($value['self_description'] ?? '') === '') {
            $errors[] = 'personality needs at least one self-described trait or description';
        }
        if ($key === 'event_availability' && isset($value['starts_at'], $value['ends_at']) && new \DateTimeImmutable($value['starts_at']) >= new \DateTimeImmutable($value['ends_at'])) {
            $errors[] = 'availability must end after it starts';
        }
        return $errors;
    }

    public static function validateNativeNameParts(?string $firstname, ?string $lastname): array
    {
        $name = trim(trim($firstname ?? '') . ' ' . trim($lastname ?? ''));
        return mb_strlen($name, 'UTF-8') > 120 ? ['姓名总长最多 120 个字符。'] : [];
    }

    /** Validate a proposed complete ordinary-profile set; identity/relation edits have other entry points. */
    public static function validateAttributeSet(array $attributes, ProfileScope $scope, bool $forConfirmation = true): array
    {
        $errors = [];
        $counts = [];
        $fields = self::definitions();
        foreach ($attributes as $i => $attribute) {
            if (!is_array($attribute) || !isset($attribute['key']) || !is_string($attribute['key']) || !isset($fields[$attribute['key']])) {
                $errors[] = 'attribute ' . $i . ' has an unknown ordinary-profile key';
                continue;
            }
            $key = $attribute['key'];
            $field = $fields[$key];
            $counts[$key] = ($counts[$key] ?? 0) + 1;
            if ($field['scope'] !== $scope->kind()) {
                $errors[] = $key . ' is not valid in this scope';
            }
            if ($counts[$key] > $field['max_items']) {
                $errors[] = $key . ' exceeds its allowed item count';
            }
            if (isset($attribute['visibility']) && !in_array($attribute['visibility'], self::VISIBILITIES, true)) {
                $errors[] = $key . ' has an unknown visibility';
            }
            if (!array_key_exists('value', $attribute)) {
                $errors[] = $key . ' is missing its value';
            } else {
                array_push($errors, ...self::validate($key, $attribute['value'], $forConfirmation));
            }
        }
        return $errors;
    }
}
