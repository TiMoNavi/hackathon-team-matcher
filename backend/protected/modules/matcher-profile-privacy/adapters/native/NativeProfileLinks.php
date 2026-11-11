<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\adapters\native;

use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\post\models\Post;
use humhub\modules\post\widgets\WallEntry;
use humhub\modules\space\models\Space;
use humhub\modules\user\models\User;
use humhub\modules\user\widgets\Image;
use humhub\modules\user\widgets\ProfileHeader;
use humhub\modules\user\widgets\ProfileMenu;
use Yii;
use yii\base\Event;
use yii\base\Widget;
use yii\base\WidgetEvent;
use yii\helpers\Html;

/** Preserves validated entry context on native links without changing User models or post bodies. */
final class NativeProfileLinks
{
    public static function install(): void
    {
        Event::off(ProfileMenu::class, ProfileMenu::EVENT_RUN, [self::class, 'onProfileMenu']);
        Event::on(ProfileMenu::class, ProfileMenu::EVENT_RUN, [self::class, 'onProfileMenu']);
        foreach ([[WallEntry::class, 'onPost'], [ProfileMenu::class, 'onProfileWidget'], [ProfileHeader::class, 'onProfileWidget'], [Image::class, 'onProfileWidget']] as [$widget, $method]) {
            Event::off($widget, Widget::EVENT_AFTER_RUN, [self::class, $method]);
            Event::on($widget, Widget::EVENT_AFTER_RUN, [self::class, $method]);
        }
    }

    /** The projected About page follows P8 entry policy, including verified Space/public-post entry. */
    public static function onProfileMenu(Event $event): void
    {
        $menu = $event->sender;
        if (!$menu instanceof ProfileMenu || !$menu->user instanceof User || NativeRequestContext::actorId() < 1) { return; }
        try { $context = self::verify((int)$menu->user->id, NativeRequestContext::forOwner((int)$menu->user->id)); }
        catch (ProfileException) { return; }
        $about = $menu->getEntryByUrl($menu->user->createUrl('/user/profile/about'));
        if ($about !== null) { $about->setIsVisible($context !== null); }
    }

    public static function aboutUrl(User $owner, array $context): ?string
    {
        $context = self::verify((int)$owner->id, $context);
        return $context === null ? null : self::withContext($owner->createUrl('/user/profile/about'), $context);
    }

    public static function onPost(WidgetEvent $event): void
    {
        $widget = $event->sender;
        if (!$widget instanceof WallEntry || !$widget->model instanceof Post || !is_string($event->result) || NativeRequestContext::actorId() < 1) { return; }
        $post = $widget->model; $owner = $post->content->createdBy;
        if (!$owner instanceof User) { return; }
        $context = self::verify((int)$owner->id, ['entry_type' => 'public_post', 'post_id' => (int)$post->id, 'purpose' => 'detail']);
        if ($context === null && $post->content->container instanceof Space) {
            $context = self::verify((int)$owner->id, ['entry_type' => 'space', 'space_id' => (int)$post->content->container->id, 'purpose' => 'detail']);
        }
        if ($context === null) { return; }
        // Only the native author header is inspected. User-authored rich text and addons remain byte-for-byte intact.
        $boundary = strpos($event->result, '<div class="wall-entry-body"');
        if ($boundary === false) { $boundary = strpos($event->result, '<div class="content"'); }
        if ($boundary === false) { return; }
        $header = substr($event->result, 0, $boundary);
        $suffix = substr($event->result, $boundary);
        $about = self::withContext($owner->createUrl('/user/profile/about'), $context);
        $event->result = self::rewriteLinks($header, $owner, $context, $about) . $suffix;
    }

    public static function onProfileWidget(WidgetEvent $event): void
    {
        $widget = $event->sender;
        if (!is_string($event->result) || !($widget->user ?? null) instanceof User || NativeRequestContext::actorId() < 1) { return; }
        $owner = $widget->user;
        try { $context = self::verify((int)$owner->id, NativeRequestContext::forOwner((int)$owner->id)); }
        catch (ProfileException) { return; }
        if ($context === null || $context['entry_type'] === 'self') { return; }
        $event->result = self::rewriteLinks($event->result, $owner, $context);
    }

    /** Verifying a link is a read; lock ordering matches the actual profile projection. */
    private static function verify(int $ownerId, array $context): ?array
    {
        $viewer = NativeRequestContext::actorId();
        if ($viewer < 1) { return null; }
        $context['purpose'] = 'detail';
        try {
            $privacy = Yii::$app->getModule('matcher-profile-privacy');
            $repository = Yii::$app->getModule('matcher-user-profile')->getProfileRepository();
            $repository->transaction(static function () use ($repository, $privacy, $viewer, $ownerId, $context): void {
                $repository->findState($ownerId, ProfileScope::global(), true);
                $privacy->getReadPolicy()->assertCanRead($viewer, $ownerId, ProfileScope::global(), $context);
            });
            return $viewer === $ownerId ? ['entry_type' => 'self', 'purpose' => 'detail'] : $context;
        } catch (ProfileException $error) {
            if (in_array($error->httpStatus, [401, 403, 404, 422], true)) { return null; }
            throw $error;
        }
    }

    private static function rewriteLinks(string $html, User $owner, array $context, ?string $destination = null): string
    {
        $pattern = <<<'REGEX'
~(<a\b[^>]*\bhref=)(["'])(.*?)\2([^>]*>)~is
REGEX;
        return preg_replace_callback($pattern, static function (array $match) use ($owner, $context, $destination): string {
            $url = html_entity_decode($match[3], ENT_QUOTES | ENT_HTML5, 'UTF-8');
            if (!self::belongsToProfile($url, $owner)) { return $match[0]; }
            $target = $destination ?? self::withContext($url, $context);
            $tail = $match[4];
            $marker = 'data-profile-entry="' . Html::encode($context['entry_type']) . '"';
            if (str_contains($tail, 'data-profile-entry=')) {
                $tail = preg_replace('~data-profile-entry="[^"]*"~', $marker, $tail) ?? $tail;
            } else { $tail = substr($tail, 0, -1) . ' ' . $marker . '>'; }
            return $match[1] . $match[2] . Html::encode($target) . $match[2] . $tail;
        }, $html) ?? $html;
    }

    private static function belongsToProfile(string $url, User $owner): bool
    {
        $home = parse_url($owner->getUrl()); $candidate = parse_url($url);
        if ($home === false || $candidate === false) { return false; }
        if (isset($candidate['host'])) {
            $origin = parse_url(Yii::$app->request->hostInfo);
            if (strtolower($candidate['host']) !== strtolower($origin['host'] ?? '') || ($candidate['port'] ?? null) !== ($origin['port'] ?? null)) { return false; }
        }
        $homePath = rtrim($home['path'] ?? '', '/'); $path = rtrim($candidate['path'] ?? '', '/');
        parse_str($home['query'] ?? '', $homeQuery); parse_str($candidate['query'] ?? '', $query);
        if (isset($homeQuery['r'])) {
            if ($path !== $homePath || !in_array(trim((string)($query['r'] ?? ''), '/'), ['user/profile', 'user/profile/index', 'user/profile/home', 'user/profile/about'], true)) { return false; }
            foreach ($homeQuery as $key => $value) { if ($key !== 'r' && ($query[$key] ?? null) !== $value) { return false; } }
            return true;
        }
        // Pretty profile routes are siblings (/u/name/home, /u/name/about).
        // Use the generated About route to derive the exact container prefix.
        $about = parse_url($owner->createUrl('/user/profile/about'));
        $aboutPath = rtrim($about['path'] ?? '', '/');
        if (!str_ends_with($aboutPath, '/about')) { return $path === $homePath; }
        $containerPath = substr($aboutPath, 0, -strlen('/about'));
        return $containerPath !== '' && in_array($path, [$containerPath, $containerPath . '/home', $containerPath . '/about'], true);
    }

    private static function withContext(string $url, array $context): string
    {
        $fragment = ''; $hash = strpos($url, '#');
        if ($hash !== false) { $fragment = substr($url, $hash); $url = substr($url, 0, $hash); }
        $parts = explode('?', $url, 2); parse_str($parts[1] ?? '', $query);
        unset($query['entry_type'], $query['space_id'], $query['post_id']);
        $entry = $context['entry_type'];
        if ($entry !== 'self') { $query['entry_type'] = $entry; }
        if ($entry === 'space') { $query['space_id'] = $context['space_id']; }
        if ($entry === 'public_post') { $query['post_id'] = $context['post_id']; }
        return $parts[0] . ($query === [] ? '' : '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986)) . $fragment;
    }
}
