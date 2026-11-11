<?php
declare(strict_types=1);
namespace humhub\modules\calendar\helpers\dav;

use humhub\modules\user\models\User;
use Sabre\DAV\Exception\MethodNotAllowed;
use Sabre\DAV\PropPatch;
use Sabre\DAVACL\PrincipalBackend\AbstractBackend;
use Yii;

/** CalDAV account discovery is restricted to the authenticated sync account. */
class PrincipalBackend extends AbstractBackend
{
    public function getPrincipalsByPrefix($prefix)
    {
        $user = $this->actor();
        return $user && trim((string)$prefix, '/') === 'principals' ? [$this->principal($user)] : [];
    }
    public function getPrincipalByPath($path)
    {
        $user = $this->actor();
        return $user && trim((string)$path, '/') === 'principals/' . $user->username ? $this->principal($user) : null;
    }
    public function searchPrincipals($prefixPath, array $searchProperties, $test = 'allof')
    {
        $user = $this->actor();
        if (!$user || trim((string)$prefixPath, '/') !== 'principals') { return []; }
        $principal = $this->principal($user);
        $matches = [];
        foreach ($searchProperties as $key => $value) {
            $matches[] = isset($principal[$key]) && is_string($principal[$key]) && mb_stripos($principal[$key], (string)$value) !== false;
        }
        $matched = $test === 'anyof' ? in_array(true, $matches, true) : !in_array(false, $matches, true);
        return $matched ? [$principal['uri']] : [];
    }
    public function updatePrincipal($path, PropPatch $propPatch) { throw new MethodNotAllowed('Updating principals is not supported.'); }
    public function getGroupMemberSet($principal) { return []; }
    public function getGroupMembership($principal) { return []; }
    public function setGroupMemberSet($principal, array $members) { throw new MethodNotAllowed('Group management is not supported.'); }
    public function getPrincipalAcl($path)
    {
        $principal = $this->getPrincipalByPath($path);
        return $principal ? [['principal' => $principal['uri'], 'privilege' => '{DAV:}read', 'grant' => true]] : [];
    }
    private function actor(): ?User
    {
        if (!Yii::$app->has('user') || Yii::$app->user->isGuest) { return null; }
        $user = Yii::$app->user->getIdentity();
        return $user instanceof User && $user->status === User::STATUS_ENABLED ? $user : null;
    }
    private function principal(User $user): array
    {
        return [
            'uri' => 'principals/' . $user->username,
            '{DAV:}displayname' => $user->displayName,
            '{http://sabredav.org/ns}email-address' => $user->email,
            '{urn:ietf:params:xml:ns:caldav}calendar-home-set' => ['href' => '/calendars/' . $user->username . '/'],
            '{urn:ietf:params:xml:ns:caldav}calendar-resource-uri' => [['href' => '/calendars/' . $user->username . '/']],
        ];
    }
}
