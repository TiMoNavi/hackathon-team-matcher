<?php
declare(strict_types=1);
namespace humhub\modules\matcherGithubImport\application;

use humhub\modules\matcherGithubImport\domain\GithubTextMapper;
use humhub\modules\matcherGithubImport\domain\ports\GithubApi;
use humhub\modules\matcherGithubImport\domain\ports\GithubIdentity;
use humhub\modules\matcherProfile\domain\ports\ProfileSourceReader;
use humhub\modules\matcherProfile\domain\ProfileException;

final class GithubSourceReader implements ProfileSourceReader
{
    public const MAX_REPOSITORIES = 10;
    public const MAX_README_BYTES = 24576;
    public function __construct(private GithubIdentity $identity, private GithubApi $api) {}
    public function kind(): string { return 'github'; }
    public function status(int $ownerId): array
    {
        if ($ownerId < 1) { throw new ProfileException('AUTHENTICATION_REQUIRED', 'Sign in before importing your profile.', 401); }
        return ['kind' => $this->kind()] + $this->identity->status($ownerId);
    }
    public function read(int $ownerId, array $input): array
    {
        if ($input !== []) { throw new ProfileException('GITHUB_INPUT_NOT_ALLOWED', 'The GitHub account is detected from your verified login. No username or URL is accepted.'); }
        $identity = $this->status($ownerId);
        if (!($identity['available'] ?? false) || !($identity['linked'] ?? false)) {
            throw new ProfileException($identity['reason'] ?? 'GITHUB_NOT_LINKED', 'Connect your own GitHub account through GitHub Sign-In before importing.', 409);
        }
        $id = (string)($identity['provider_user_id'] ?? '');
        if (!preg_match('/^[1-9][0-9]{0,19}$/D', $id)) { throw new ProfileException('GITHUB_IDENTITY_INVALID', 'The verified GitHub association is invalid.', 409); }
        $this->api->beginRead();
        $profile = $this->api->get('/user/' . $id);
        $login = is_string($profile['login'] ?? null) ? $profile['login'] : '';
        if ((string)($profile['id'] ?? '') !== $id || ($profile['type'] ?? '') !== 'User'
            || !preg_match('/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/D', $login)) {
            throw new ProfileException('GITHUB_IDENTITY_MISMATCH', 'GitHub did not return the linked personal account.', 409);
        }
        $warnings = []; $repositories = [];
        try {
            $list = $this->api->get('/users/' . $login . '/repos', ['per_page' => self::MAX_REPOSITORIES, 'type' => 'owner', 'sort' => 'full_name', 'direction' => 'asc']);
            if (!array_is_list($list)) { throw new ProfileException('GITHUB_INVALID_RESPONSE', 'GitHub returned an unreadable repository list.', 503); }
            foreach (array_slice($list, 0, self::MAX_REPOSITORIES) as $repo) {
                if (!is_array($repo) || ($repo['private'] ?? true) !== false || ($repo['visibility'] ?? 'public') !== 'public'
                    || ($repo['fork'] ?? true) !== false || (string)($repo['owner']['id'] ?? '') !== $id
                    || !is_string($repo['name'] ?? null) || !preg_match('/^[A-Za-z0-9_.-]{1,100}$/D', $repo['name'])
                    || in_array($repo['name'], ['.', '..'], true) || !preg_match('/^[1-9][0-9]*$/D', (string)($repo['id'] ?? ''))) { continue; }
                $repositories[] = $repo;
            }
        } catch (ProfileException $error) { $warnings[] = ['part' => 'repositories', 'code' => $error->errorCode]; }
        $readmes = []; $profileReadme = null; $profileReadmeAttempted = false;
        foreach ($repositories as $repo) {
            $isProfileReadme = strcasecmp($repo['name'], $login) === 0;
            if ($isProfileReadme) { $profileReadmeAttempted = true; }
            try {
                $readme = $this->api->get('/repos/' . $login . '/' . $repo['name'] . '/readme', [], true);
                if ($readme === null) { continue; }
                if (($readme['encoding'] ?? null) !== 'base64' || !is_string($readme['content'] ?? null)) {
                    $warnings[] = ['part' => 'readme:' . $repo['id'], 'code' => 'GITHUB_README_UNSUPPORTED']; continue;
                }
                $text = base64_decode(preg_replace('/\s+/', '', $readme['content']), true);
                if ($text === false || !mb_check_encoding($text, 'UTF-8') || str_contains($text, chr(0))) {
                    $warnings[] = ['part' => 'readme:' . $repo['id'], 'code' => 'GITHUB_README_NOT_TEXT']; continue;
                }
                $truncated = strlen($text) > self::MAX_README_BYTES;
                $text = $truncated ? mb_strcut($text, 0, self::MAX_README_BYTES, 'UTF-8') : $text;
                if ($isProfileReadme) { $profileReadme = ['text' => $text, 'truncated' => $truncated]; }
                else { $readmes[(string)$repo['id']] = ['text' => $text, 'truncated' => $truncated]; }
                if ($truncated) { $warnings[] = ['part' => 'readme:' . $repo['id'], 'code' => 'GITHUB_README_TRUNCATED']; }
            } catch (ProfileException $error) { $warnings[] = ['part' => 'readme:' . $repo['id'], 'code' => $error->errorCode]; }
        }
        // The personal profile README is independent of the first ten repositories.
        if (!$profileReadmeAttempted) {
            try {
                $readme = $this->api->get('/repos/' . $login . '/' . $login . '/readme', [], true);
                if ($readme !== null) {
                    $text = ($readme['encoding'] ?? null) === 'base64' && is_string($readme['content'] ?? null)
                        ? base64_decode(preg_replace('/\s+/', '', $readme['content']), true) : false;
                    if ($text === false || !mb_check_encoding($text, 'UTF-8') || str_contains($text, chr(0))) {
                        $warnings[] = ['part' => 'profile_readme', 'code' => 'GITHUB_README_NOT_TEXT'];
                    } else {
                        $truncated = strlen($text) > self::MAX_README_BYTES;
                        $profileReadme = ['text' => $truncated ? mb_strcut($text, 0, self::MAX_README_BYTES, 'UTF-8') : $text, 'truncated' => $truncated];
                        if ($truncated) { $warnings[] = ['part' => 'profile_readme', 'code' => 'GITHUB_README_TRUNCATED']; }
                    }
                }
            } catch (ProfileException $error) { $warnings[] = ['part' => 'profile_readme', 'code' => $error->errorCode]; }
        }
        // Revalidate the association after I/O, before saving a disconnected/relinked account.
        $current = $this->identity->status($ownerId);
        if (!($current['available'] ?? false) || !($current['linked'] ?? false) || (string)($current['provider_user_id'] ?? '') !== $id) {
            throw new ProfileException('GITHUB_IDENTITY_CHANGED', 'Your GitHub association changed. Reload before importing again.', 409);
        }
        return (new GithubTextMapper())->map($profile, $repositories, $readmes, $warnings, $profileReadme);
    }
}
