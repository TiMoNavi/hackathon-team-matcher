<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\domain\rules;

/** Deterministic saved questions; no model, network or inferred personality. */
final class RuleQuestionProvider implements \humhub\modules\matcherProfile\domain\ports\QuestionProvider
{
    public const VERSION = 's4-rules-2026-11-11';
    public function questions(array $profiles, ?int $spaceId): array
    {
        $templates = $this->templates();
        $eligible = [];
        foreach ($templates as $template) {
            if ($template['scope'] === 'space' && $spaceId === null) { continue; }
            $present = array_column($profiles[$template['scope']]['attributes'] ?? [], 'key');
            $template['missing'] = !in_array($template['target_key'], $present, true);
            $template['reason'] = $template['missing'] ? ($template['scope'] === 'space' ? '还不了解你在本次 Space 的安排，补充后方便找到合适的队友。' : '已有资料还没有这一项，可以选择最接近自己的说法。') : '已有这一项资料，可以确认当前想法，也可以暂时跳过。';
            $eligible[] = $template;
        }
        usort($eligible, static fn(array $a, array $b): int => ((int)$b['missing'] <=> (int)$a['missing']) ?: ($a['priority'] <=> $b['priority']));
        $count = max(3, min(8, count(array_filter($eligible, static fn(array $q): bool => $q['missing']))));
        return array_map(static function (array $question): array { unset($question['missing'], $question['priority']); return $question; }, array_slice($eligible, 0, $count));
    }
    private function templates(): array
    {
        $out = [];
        $add = static function (string $key, string $scope, string $prompt, array $options, int $priority, string $mode = 'multiple') use (&$out): void {
            $out[] = ['id' => 's4_' . $key, 'template_id' => 's4_' . $key, 'target_key' => $key, 'scope' => $scope, 'prompt' => $prompt, 'mode' => $mode, 'priority' => $priority, 'options' => array_map(static fn(string $code, string $label): array => ['code' => $code, 'label' => $label], array_keys($options), array_values($options)), 'allow_free_text' => true, 'allow_skip' => true];
        };
        $roles = ['backend' => '后端开发', 'frontend' => '前端开发', 'design' => '交互与视觉设计', 'product' => '产品与用户研究', 'business' => '商业与运营'];
        $add('role', 'global', '和别人一起做项目时，你通常能贡献什么？', $roles, 10);
        $add('interest', 'global', '你对哪些方向比较感兴趣？', ['ai' => '人工智能', 'developer_tools' => '开发工具', 'education' => '教育与学习', 'creative' => '创意与内容', 'social_good' => '社会与公共服务'], 20);
        $add('communication_preference', 'global', '你长期更习惯怎样沟通？', ['async' => '文字异步沟通', 'short_calls' => '必要时短语音', 'regular_checkin' => '固定时间同步', 'in_person' => '当面讨论'], 30);
        $add('collaboration_preference', 'global', '什么样的协作方式让你比较舒服？', ['clear_roles' => '先明确分工', 'explore_together' => '一起讨论再分工', 'quick_prototype' => '先做一个小原型', 'document_decisions' => '记录决定和进度'], 40);
        $add('personality', 'global', '你会怎样描述自己做事的风格？', ['patient' => '耐心', 'curious' => '好奇', 'structured' => '喜欢有条理', 'experimental' => '愿意试验', 'reflective' => '习惯先思考'], 50);
        $add('seeking', 'global', '长期来说，你期待怎样的合作？', ['build_together' => '一起把想法做出来', 'learn_together' => '互相学习', 'long_term' => '寻找长期伙伴', 'meet_people' => '认识不同领域的人'], 60);
        $add('event_goal', 'space', '在这次 Space，你最希望获得什么？', ['prototype' => '完成一个可展示原型', 'validate' => '验证一个问题或想法', 'learn' => '学习新东西', 'find_team' => '找到合作伙伴'], 5);
        $add('event_role', 'space', '这次你希望主要负责哪部分？', $roles, 15);
        $add('event_time_commitment', 'space', '这次你大致能投入多少时间？', ['light' => '每天约 1–2 小时', 'regular' => '每天约 3–5 小时', 'focused' => '每天约 6–8 小时'], 25, 'single');
        $add('event_collaboration_mode', 'space', '这次你更方便怎样参与？', ['onsite' => '主要线下', 'online' => '主要线上', 'hybrid' => '线上线下都可以'], 35, 'single');
        $add('event_seeking', 'space', '这次你希望队友补上哪些能力？', $roles, 45);
        return $out;
    }
}
