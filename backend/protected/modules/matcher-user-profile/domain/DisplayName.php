<?php
declare(strict_types=1);

namespace humhub\modules\matcherProfile\domain;

final class DisplayName
{
    public static function resolve(string $guid, ?string $nickname, int $identityVersion, bool $confirmed): string
    {
        if (!preg_match('/^[a-f0-9-]{8,36}$/iD', $guid)) {
            throw new \InvalidArgumentException('A stable user GUID is required');
        }
        $nickname = trim($nickname ?? '');
        if ($confirmed && $identityVersion > 0 && FieldCatalog::validate('nickname', $nickname) === [] && !preg_match('/[\x00-\x1F\x7F]/u', $nickname)) {
            return $nickname;
        }
        return '成员·' . substr($guid, -8);
    }
}
