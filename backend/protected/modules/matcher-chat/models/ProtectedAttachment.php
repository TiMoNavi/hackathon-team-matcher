<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\models;

/** Staged File association denies native canView/canEdit even before route guards. */
final class ProtectedAttachment extends \humhub\components\ActiveRecord implements \humhub\interfaces\ViewableInterface
{
    public static function tableName() { return '{{%matcher_chat_attachment}}'; }
    public static function primaryKey() { return ['file_id']; }
    public function canView($user = null): bool { return false; }
    public function canEdit($user = null): bool { return false; }
    public function canDelete($user = null): bool { return false; }
}
