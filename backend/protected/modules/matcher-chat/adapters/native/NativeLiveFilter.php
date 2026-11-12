<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\adapters\native;

use humhub\modules\matcherChat\domain\SafeInteger;

/** Filters native mail events before getData(), including legacy queued aggregates. */
final class NativeLiveFilter
{
    public static function isMail(object $event): bool
    {
        foreach (array_merge([get_class($event)], array_values(class_parents($event))) as $class) {
            if (str_starts_with(strtolower(ltrim($class, '\\')), 'humhub\\modules\\mail\\')) { return true; }
        }
        return false;
    }

    public static function visible(object $event, ?int $viewerId, NativeGuard $guard): bool
    {
        if (!self::isMail($event)) { return true; }
        // Both native mail events carry a whole-inbox count, even for unrelated IDs.
        if ($guard->viewerManaged($viewerId)) { return false; }
        if (!$guard->hasAny()) { return true; }
        $class = strtolower(get_class($event));
        if (!in_array($class, ['humhub\\modules\\mail\\live\\newusermessage', 'humhub\\modules\\mail\\live\\usermessagedeleted'], true)) { return false; }
        try { $id = SafeInteger::native($event->message_id ?? null, 'conversation_id'); }
        catch (\Throwable) { return false; }
        if ($guard->managed($id) || $guard->entryManaged($event->entry_id ?? null)) { return false; }
        return true;
    }
}
