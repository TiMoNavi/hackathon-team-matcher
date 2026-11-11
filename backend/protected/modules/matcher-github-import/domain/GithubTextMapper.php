<?php
declare(strict_types=1);
namespace humhub\modules\matcherGithubImport\domain;

use humhub\modules\matcherProfile\domain\FieldCatalog;

/** Maps explicit public facts; repository ownership does not assert personal contribution or proficiency. */
final class GithubTextMapper
{
    public function map(array $profile, array $repositories, array $readmes, array $warnings, ?array $profileReadme = null): array
    {
        $id = (string)$profile['id']; $login = $profile['login']; $url = 'https://github.com/' . $login;
        $sections = []; $candidates = [];
        $add = static function (string $sectionId, string $label, string $text, string $locator) use (&$sections): void {
            $sections[] = ['id' => $sectionId, 'label' => $label, 'text' => $text, 'locator' => ['path' => $locator]];
        };
        $candidate = static function (string $candidateId, string $key, mixed $value, string $evidence) use (&$candidates): void {
            if (FieldCatalog::validate($key, $value) === []) { $candidates[] = ['id' => $candidateId, 'key' => $key, 'value' => $value, 'evidence' => [$evidence]]; }
        };
        $add('github-account', 'GitHub 已验证公开账号', 'GitHub: ' . $login . "\n" . $url, '/user/' . $id);
        $candidate('github-profile-link', 'portfolio_link', ['url' => $url, 'label' => 'GitHub · ' . $login], 'github-account');
        foreach (['name' => ['公开显示名称', 120], 'bio' => ['公开简介', 10000], 'location' => ['公开地点', 255], 'company' => ['公开组织说明', 255], 'blog' => ['公开网站', 2048], 'email' => ['公开联系邮箱', 254]] as $field => [$label, $max]) {
            $text = $this->text($profile[$field] ?? null, $max); if ($text === null) { continue; }
            $section = 'github-' . $field; $add($section, $label, $text, '/user/' . $id . '#/' . $field);
            if ($field === 'bio') { $candidate('github-bio', 'bio', $text, $section); }
            if ($field === 'location') { $candidate('github-city', 'city', $text, $section); }
            if ($field === 'email') { $candidate('github-email', 'contact_email', $text, $section); }
            if ($field === 'blog') {
                $link = $this->publicUrl($text);
                if ($link !== null) { $candidate('github-website', 'portfolio_link', ['url' => $link, 'label' => 'GitHub 公开网站'], $section); }
            }
        }
        if ($profileReadme !== null) {
            $add('github-profile-readme', 'GitHub 个人主页 README', $profileReadme['text'], '/repos/' . $login . '/' . $login . '/readme');
        }
        foreach ($repositories as $repo) {
            $repoId = (string)$repo['id']; $name = $repo['name']; $repoUrl = $url . '/' . $name;
            $section = 'github-repo-' . $repoId; $lines = ['项目: ' . $name, '公开仓库: ' . $repoUrl];
            $description = $this->text($repo['description'] ?? null, 3000);
            if ($description !== null) { $lines[] = '项目说明: ' . $description; }
            $language = $this->text($repo['language'] ?? null, 64);
            if ($language !== null) { $lines[] = '仓库标注语言: ' . $language; }
            $topics = []; foreach (array_slice(is_array($repo['topics'] ?? null) ? $repo['topics'] : [], 0, 20) as $topic) { $t = $this->text($topic, 64); if ($t !== null) { $topics[] = $t; } }
            if ($topics !== []) { $lines[] = '仓库主题: ' . implode('、', $topics); }
            $add($section, '公开项目 · ' . $name, implode("\n", $lines), '/repos/' . $login . '/' . $name);
            $project = ['title' => $name, 'links' => [$repoUrl]];
            if ($language !== null) { $project['tech_codes'] = [$language]; }
            $candidate('github-project-' . $repoId, 'project', $project, $section);
            if (isset($readmes[$repoId])) {
                $add($section . '-readme', 'README · ' . $name, $readmes[$repoId]['text'], '/repos/' . $login . '/' . $name . '/readme');
            }
        }
        $raw = implode("\n\n", array_map(static fn(array $section): string => '# ' . $section['label'] . "\n" . $section['text'], $sections));
        return ['external_id' => 'github:' . $id, 'label' => 'GitHub · ' . $login, 'canonical_url' => $url,
            'raw_text' => $raw, 'sections' => $sections, 'candidates' => $candidates,
            'metadata' => ['provider' => 'github', 'provider_user_id' => $id, 'username' => $login, 'schema_version' => 1,
                'generation_mode' => 'rules', 'llm_calls' => 0, 'repository_count' => count($repositories), 'repository_limit' => 10,
                'readme_limit_bytes' => 24576, 'readme_count' => count($readmes), 'profile_readme_present' => $profileReadme !== null, 'warnings' => $warnings]];
    }
    private function text(mixed $value, int $max): ?string
    {
        if (!is_string($value) || !mb_check_encoding($value, 'UTF-8')) { return null; }
        $value = trim(str_replace([chr(0), "\r\n", "\r"], ['', "\n", "\n"], $value));
        return $value === '' ? null : mb_strcut(mb_substr($value, 0, $max, 'UTF-8'), 0, 24576, 'UTF-8');
    }
    private function publicUrl(string $value): ?string
    {
        if (!preg_match('~^https?://~i', $value)) { $value = 'https://' . $value; }
        $parts = parse_url($value);
        return filter_var($value, FILTER_VALIDATE_URL) && is_array($parts) && !isset($parts['user']) && !isset($parts['pass'])
            && in_array(strtolower($parts['scheme'] ?? ''), ['https', 'http'], true) ? $value : null;
    }
}
