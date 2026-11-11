<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\domain;

use humhub\modules\matcherProfile\domain\FieldCatalog;

/** Extract only explicitly labelled facts. Unmapped prose remains in the private source. */
final class ExplicitTextCandidateMapper
{
    public function map(array $sections): array
    {
        $result = []; $seen = []; $active = null;
        $emit = static function (string $key, mixed $value, array $evidence) use (&$result, &$seen): void {
            if ($value === '' || $value === [] || count($result) >= 200 || FieldCatalog::validate($key, $value) !== []) { return; }
            $signature = hash('sha256', $key . ':' . json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
            if (isset($seen[$signature])) {
                $index = $seen[$signature]; $result[$index]['evidence'] = array_values(array_unique([...$result[$index]['evidence'], ...$evidence])); return;
            }
            $seen[$signature] = count($result);
            $result[] = ['id' => 'resume-' . substr($signature, 0, 24), 'key' => $key, 'value' => $value, 'evidence' => array_values(array_unique($evidence))];
        };
        $flush = static function () use (&$active, $emit): void {
            if ($active !== null) { $emit($active['key'], $active['value'], $active['evidence']); $active = null; }
        };
        $plain = ['姓名'=>'real_name','名字'=>'real_name','name'=>'real_name','full name'=>'real_name','城市'=>'city','常驻城市'=>'city','所在地'=>'city','city'=>'city','location'=>'city','一句话介绍'=>'headline','一句话自述'=>'headline','headline'=>'headline','自我介绍'=>'bio','简介'=>'bio','summary'=>'bio','bio'=>'bio','邮箱'=>'contact_email','电子邮箱'=>'contact_email','email'=>'contact_email','e-mail'=>'contact_email','电话'=>'contact_phone','联系电话'=>'contact_phone','手机'=>'contact_phone','phone'=>'contact_phone','tel'=>'contact_phone','微信'=>'contact_wechat','微信号'=>'contact_wechat','wechat'=>'contact_wechat','qq'=>'contact_qq','mbti'=>'mbti'];
        $groups = ['学校'=>['education','school'],'大学'=>['education','school'],'school'=>['education','school'],'university'=>['education','school'],'项目'=>['project','title'],'项目名称'=>['project','title'],'project'=>['project','title'],'project name'=>['project','title'],'公司'=>['work_experience','organization'],'单位'=>['work_experience','organization'],'company'=>['work_experience','organization'],'employer'=>['work_experience','organization'],'获奖'=>['award','title'],'奖项'=>['award','title'],'award'=>['award','title']];
        foreach ($sections as $section) {
            $id = $section['id'] ?? null; $text = $section['text'] ?? null;
            if (!is_string($id) || !is_string($text)) { continue; }
            foreach (preg_split('/\R/u', $text) as $line) {
                $line = trim(preg_replace('/^\s*(?:#{1,6}\s*|[-*+]\s+)/u', '', $line));
                $line = str_replace(['**', '__'], '', $line);
                if (!preg_match('/^([^:：]{1,40})\s*[:：]\s*(.+)$/u', $line, $parts)) { continue; }
                $label = mb_strtolower(trim($parts[1]), 'UTF-8'); $value = trim($parts[2]);
                // A labelled subsection belongs to the active record before global aliases.
                $fields = match ($active['key'] ?? null) {
                    'education' => ['专业'=>'major','major'=>'major','学历'=>'degree','学位'=>'degree','degree'=>'degree','说明'=>'summary','summary'=>'summary'],
                    'project' => ['角色'=>'role','role'=>'role','职责'=>'contribution','贡献'=>'contribution','个人贡献'=>'contribution','contribution'=>'contribution','成果'=>'outcome','outcome'=>'outcome'],
                    'work_experience' => ['职位'=>'role','岗位'=>'role','职务'=>'role','role'=>'role','position'=>'role','职责'=>'summary','工作内容'=>'summary','summary'=>'summary'],
                    'award' => ['主办方'=>'issuer','颁发机构'=>'issuer','issuer'=>'issuer','说明'=>'description','description'=>'description'],
                    default => [],
                };
                if (isset($fields[$label])) { $active['value'][$fields[$label]] = $value; $active['evidence'][] = $id; continue; }
                if (isset($plain[$label])) {
                    $flush(); $key = $plain[$label];
                    $emit($key, $key === 'mbti' ? strtoupper($value) : $value, [$id]); continue;
                }
                if (isset($groups[$label])) {
                    $flush(); [$key, $property] = $groups[$label]; $active = ['key' => $key, 'value' => [$property => $value], 'evidence' => [$id]]; continue;
                }
                if (in_array($label, ['技能','技术技能','skills','skill','可贡献角色','roles','role interests','兴趣','interests'], true)) {
                    $flush(); $key = in_array($label, ['可贡献角色','roles','role interests'], true) ? 'role' : (in_array($label, ['兴趣','interests'], true) ? 'interest' : 'skill');
                    foreach (preg_split('/\s*[,，、;；|]\s*/u', $value) as $name) { $name = trim($name); if ($name !== '') { $emit($key, ['code' => $this->code($name), 'label' => $name], [$id]); } }
                    continue;
                }
                if (in_array($label, ['主页','个人主页','网站','作品链接','website','portfolio','github'], true)) {
                    $flush(); $url = $this->url($value); if ($url !== null) { $emit('portfolio_link', ['url' => $url, 'label' => $label === 'github' ? 'GitHub' : '个人作品链接'], [$id]); } continue;
                }
                if ($active === null) { continue; }
                if ($active['key'] === 'project' && in_array($label, ['技术','技术栈','tech','technologies'], true)) {
                    $active['value']['tech_codes'] = array_values(array_unique(array_map(fn(string $v): string => $this->code(trim($v)), preg_split('/\s*[,，、;；|]\s*/u', $value)))); $active['evidence'][] = $id; continue;
                }
                if ($active['key'] === 'project' && in_array($label, ['链接','link','url'], true)) {
                    $url = $this->url($value); if ($url !== null) { $active['value']['links'][] = $url; $active['evidence'][] = $id; } continue;
                }
                $dateKey = in_array($label, ['开始','开始日期','start'], true) ? 'start' : (in_array($label, ['结束','结束日期','end'], true) ? 'end' : ($active['key'] === 'award' && in_array($label, ['日期','date'], true) ? 'date' : null));
                if ($dateKey !== null && ($active['key'] !== 'award' || $dateKey === 'date')) {
                    $date = $this->date($value); if ($date !== null) { $active['value'][$dateKey] = $date; $active['evidence'][] = $id; }
                }
            }
        }
        $flush(); return $result;
    }
    private function code(string $label): string
    {
        $value = strtolower(preg_replace('/[^A-Za-z0-9+#.]+/', '-', $label));
        $value = trim($value, '-');
        return $value === '' || strlen($value) > 64 ? 'resume-' . substr(hash('sha256', $label), 0, 16) : $value;
    }
    private function url(string $value): ?string
    {
        if (preg_match('/^\[[^\]]*\]\((https?:\/\/[^)]+)\)$/u', $value, $match)) { $value = $match[1]; }
        return FieldCatalog::validate('portfolio_link', ['url' => $value, 'label' => '链接']) === [] ? $value : null;
    }
    private function date(string $value): ?array
    {
        if (!preg_match('/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/D', $value)) { return null; }
        return ['value' => $value, 'precision' => strlen($value) === 4 ? 'year' : (strlen($value) === 7 ? 'month' : 'day')];
    }
}
