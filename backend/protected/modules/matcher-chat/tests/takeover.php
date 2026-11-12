<?php
declare(strict_types=1);
// Reuse the native guard's no-connection SQL seam; no application or HTTP starts.
ob_start();
require __DIR__ . '/native.php';
$nativeSummary = json_decode(trim(ob_get_clean()), true, 8, JSON_THROW_ON_ERROR);
$checks = 0;

use humhub\modules\matcherChat\application\EntryPolicy;
use humhub\modules\matcherChat\adapters\http\EntryTakeoverEvent;
use humhub\modules\matcherChat\adapters\native\NativeLiveFilter;
use humhub\modules\matcherChat\adapters\native\GuardedPollController;
use humhub\modules\matcherChat\domain\ChatException;
use humhub\modules\matcherChat\Events;

$coverage = ['native_total' => 2, 'managed_total' => 2, 'unmanaged_total' => 0, 'revoked_total' => 1];
foreach ([true, 1, '1', 'true'] as $setting) {
    check(EntryPolicy::enabled(true, $setting), 'explicit double gate enabled');
    check(!EntryPolicy::enabled(false, $setting), 'persistent setting cannot override configuration gate');
}
foreach ([false, null, 0, '0', 'false', '', 'TRUE', [], new stdClass()] as $setting) { check(!EntryPolicy::enabled(true, $setting), 'unrecognized persistent gate closed'); }
$status = EntryPolicy::status(true, true, true, $coverage, '');
check(array_keys($status) === ['enabled', 'state', 'list_url', 'coverage', 'capabilities'], 'UI status keys frozen');
check($status['state'] === 'takeover' && $status['list_url'] === '/matcher/chat', 'full scope navigates');
check($status['coverage']['revoked_total'] === 1 && $status['capabilities'] === ['read' => true, 'send' => false, 'group' => false, 'attachments' => false], 'revoked fact is retained without granting writes');
check(EntryPolicy::status(false, true, true, $coverage, '')['state'] === 'native', 'off does not declare replacement');
check(EntryPolicy::status(true, false, true, $coverage, '')['state'] === 'native', 'unrelated user keeps native entry');
foreach ([false, true] as $ready) {
    $mixed = EntryPolicy::status(true, true, $ready, ['native_total' => 3, 'managed_total' => 2, 'unmanaged_total' => 1, 'revoked_total' => 1], '');
    check($mixed['state'] === ($ready ? 'unsupported_coverage' : 'paused') && $mixed['list_url'] === null && !$mixed['capabilities']['read'], 'mixed scope never advertises a subset as full replacement');
}
check(EntryPolicy::status(true, true, false, $coverage, '')['state'] === 'paused', 'read/UI/driver unready pauses navigation');
foreach (['mail', 'mail/mail', 'mail/mail/index', 'mail/inbox', 'mail/inbox/index'] as $route) {
    check(EntryPolicy::navigation($route, 'GET', []) === ['kind' => 'list', 'id' => null], 'registered list aliases');
    check(EntryPolicy::navigation($route, 'GET', ['id' => '10', 'returnUrl' => 'https://example.invalid/']) === ['kind' => 'conversation', 'id' => 10], 'only verified local id is retained');
}
check(EntryPolicy::navigation('mail/mail/show', 'GET', ['id' => 10]) === ['kind' => 'conversation', 'id' => 10], 'show is intercepted before seen');
foreach (['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as $method) {
    check(EntryPolicy::navigation('mail/mail/show', $method, ['id' => 10]) === null, 'old non-GET never redirected or replayed');
}
foreach (['mail/mail/reply', 'mail/mail/seen', 'mail/mail/create', 'mail/mail/load-more', 'mail/mail/update', 'mail/mail/notification-list', 'mail/mail/get-new-message-count-json', 'mail/rest/message/index', 'file/file/download', 'meta-search/index'] as $route) {
    check(EntryPolicy::navigation($route, 'GET', ['id' => 10]) === null, 'API/fragment/write/file request is not HTML navigation');
}
foreach ([[], ['id' => '01'], ['id' => 0], ['id' => true], ['id' => ['10']], ['id' => '9007199254740992'], ['id' => null], ['id' => '10 ']] as $input) {
    domainError(fn () => EntryPolicy::navigation('mail/mail/show', 'GET', $input), 'CONVERSATION_UNAVAILABLE', 'malformed navigation id unavailable');
}
check(EntryPolicy::target('', 10) === '/matcher/chat/conversations/10', 'fixed same-origin detail');
check(EntryPolicy::target('/nested/site', null) === '/nested/site/matcher/chat', 'trusted mounted site supported');
foreach (['//example.invalid', 'https://example.invalid', '/bad?next=1', '/bad#next', '/..', "/bad\r\nLocation:x"] as $base) {
    try { EntryPolicy::target($base, 10); throw new RuntimeException('Untrusted mount accepted.'); }
    catch (LogicException) { check(true, 'untrusted redirect mount refused'); }
}
$event = new EntryTakeoverEvent(1);
check($event->viewerId === 1 && $event->uiReady === false, 'readiness event starts denied');
$event->uiReady = true;
check($event->uiReady, 'UI may answer readiness only');

require_once $backend . '/protected/modules/mail/live/NewUserMessage.php';
require_once $backend . '/protected/modules/mail/live/UserMessageDeleted.php';
$mailReflection = new ReflectionClass(\humhub\modules\mail\live\NewUserMessage::class);
$mail = $mailReflection->newInstanceWithoutConstructor(); // Native init would calculate a real global count.
$mail->message_id = 99;
$mail->count = 123;
check(NativeLiveFilter::isMail($mail), 'native mail event identified');
check(!NativeLiveFilter::visible($mail, 1, $guard), 'managed viewer never receives unrelated mail global count');
check(NativeLiveFilter::visible($mail, 9, $guard), 'unrelated viewer unmanaged mail event retained');
$mail->message_id = 10;
check(!NativeLiveFilter::visible($mail, 9, $guard), 'managed object never exposed through foreign queued event');
foreach ([null, 0, -1, '01', '9007199254740992', ['99']] as $id) {
    $mail->message_id = $id;
    check(!NativeLiveFilter::visible($mail, 9, $guard), 'noncanonical queued object denied');
}
$deleted = (new ReflectionClass(\humhub\modules\mail\live\UserMessageDeleted::class))->newInstanceWithoutConstructor();
$deleted->message_id = 99;
$deleted->entry_id = 1001;
check(!NativeLiveFilter::visible($deleted, 9, $guard), 'entry tombstone association remains protected');
$deleted->entry_id = 999;
check(!NativeLiveFilter::visible($deleted, 1, $guard), 'deleted event global count suppressed for affected viewer');
check(NativeLiveFilter::visible($deleted, 9, $guard), 'unrelated deleted event retained');
$thirdPartyMail = new class extends \humhub\modules\mail\live\NewUserMessage { public function init() {} };
$thirdPartyMail->message_id = 99;
check(NativeLiveFilter::isMail($thirdPartyMail) && !NativeLiveFilter::visible($thirdPartyMail, 9, $guard), 'third-party subclass cannot disguise native mail ancestry');
$other = new class extends \humhub\modules\live\components\LiveEvent {};
$beforeLookups = $connection->lookups;
check(!NativeLiveFilter::isMail($other) && NativeLiveFilter::visible($other, 1, $guard), 'non-chat event retained for affected viewer');
check($connection->lookups === $beforeLookups, 'non-chat live requires no chat database check');
$poll = (new ReflectionClass(GuardedPollController::class))->newInstanceWithoutConstructor();
$visibility = new ReflectionMethod(GuardedPollController::class, 'checkVisibility');
check($visibility->invoke($poll, $other) === true, 'real poll subclass preserves non-chat event without application/storage');
check($visibility->invoke($poll, $mail) === false, 'real poll subclass fails closed for mail when protection unavailable');

// An uninitialized application test double supplies only a module map; no bootstrap,
// session, request, schema, connection or service starts.
$previousApplication = Yii::$app;
$app = new class extends \yii\web\Application {
    public array $fixtureModules = [];
    public function __construct() {}
    public function hasModule($id) { return isset($this->fixtureModules[$id]); }
    public function getModule($id, $load = true) { return $this->fixtureModules[$id] ?? null; }
};
Yii::$app = $app;
$module = (new ReflectionClass(\humhub\modules\matcherChat\Module::class))->newInstanceWithoutConstructor();
check(!$module->installPollProtection(), 'missing live module refuses coverage readiness');
$liveModule = new \yii\base\Module('synthetic-live');
$app->fixtureModules['live'] = $liveModule;
check($module->installPollProtection() && $liveModule->controllerMap['poll'] === GuardedPollController::class, 'empty poll map receives isolated subclass');
check($module->installPollProtection(), 'repeated poll map installation is idempotent');
$liveModule->controllerMap['poll'] = 'SyntheticThirdPartyPollController';
check(!$module->installPollProtection() && $liveModule->controllerMap['poll'] === 'SyntheticThirdPartyPollController', 'third-party poll mapping is preserved and refused');
$liveModule->controllerMap['poll'] = ['class' => \humhub\modules\live\controllers\PollController::class, 'maxEventsByQuery' => 5];
check(!$module->installPollProtection() && $liveModule->controllerMap['poll']['maxEventsByQuery'] === 5, 'custom native poll configuration is not silently overwritten');
$liveModule->controllerMap['poll'] = \humhub\modules\live\controllers\PollController::class;
check($module->installPollProtection(), 'explicit unchanged native poll class may be adapted');
Yii::$app = $previousApplication;

$needsGuard = new ReflectionMethod(Events::class, 'needsGuard');
foreach (['dashboard/dashboard', 'user/auth/login', 'activity/stream', 'matcher-chat-ui/app/index'] as $route) {
    check(!$needsGuard->invoke(null, $route, ['guid' => 'synthetic-managed-file'], [], false), 'unrelated route avoids chat schema dependency');
}
check(!$needsGuard->invoke(null, 'live/poll/index', [], [], true), 'guarded polling handles chat storage failure per event');
check(!$needsGuard->invoke(null, 'meta-search/index', [], ['provider' => 'humhub\\modules\\space\\search\\SpaceSearchProvider'], false), 'non-chat search avoids chat schema dependency');
check($needsGuard->invoke(null, 'meta-search/index', ['provider' => 'space'], [], false), 'unparsed search body remains protected');
check($needsGuard->invoke(null, 'mail/mail/show', [], [], false), 'native chat retains fail-closed schema checks');

echo json_encode(['status' => 'passed', 'checks' => $checks, 'native_checks' => $nativeSummary['checks'],
    'database_connections' => 0, 'http_requests' => 0, 'scope' => 'pure navigation/readiness/live filtering; no installation or HTTP acceptance'], JSON_THROW_ON_ERROR), PHP_EOL;
