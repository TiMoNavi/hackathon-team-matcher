#!/usr/bin/env python3
"""Deterministic fictional S7 people. No database, network, model or private input."""
import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs/用户画像收集/examples"
DATASET = "s7-people_2026-11-12"

# Each track has its own contribution, skills, interests, education and project problem.
TRACKS = [
    ("frontend", "前端工程师", "计算机科学", "typescript,react,accessibility", "TypeScript,React,无障碍交互", "education", "教育工具", "课程笔记协作板", "实现键盘操作、状态恢复与可测试的交互组件"),
    ("backend", "后端工程师", "软件工程", "python,fastapi,postgresql", "Python,FastAPI,PostgreSQL", "public-service", "公共服务", "社区预约调度器", "设计幂等写入、权限边界与冲突处理"),
    ("product", "产品策划", "信息管理", "user-research,prototyping,prioritization", "用户访谈,交互原型,需求排序", "care", "社区关怀", "互助需求看板", "梳理使用场景、写验收条件并组织可用性访谈"),
    ("visual-designer", "视觉设计师", "视觉传达", "figma,typography,design-systems", "Figma,字体排版,设计系统", "culture", "地方文化", "街区故事导览", "建立色彩与字级规范、绘制页面并检查阅读层次"),
    ("data-engineer", "数据工程师", "统计学", "sql,duckdb,data-validation", "SQL,DuckDB,数据校验", "climate", "气候与环境", "能源消耗观察台", "清洗事件数据、核对指标口径并处理缺失值"),
    ("ml-engineer", "机器学习工程师", "应用数学", "pytorch,evaluation,retrieval", "PyTorch,离线评估,检索", "science", "开放科学", "论文证据索引", "建立小型离线评价集、标记失败模式并记录检索来源"),
    ("hardware", "硬件原型工程师", "电子信息", "embedded-c,kicad,sensor-design", "嵌入式C,KiCad,传感器设计", "urban", "城市体验", "街道噪声记录器", "完成低功耗采样、电路原型与离线缓存验证"),
    ("game-developer", "游戏开发者", "数字媒体", "godot,game-design,pixel-art", "Godot,游戏规则,像素绘制", "play", "合作游戏", "双人解谜实验室", "制作关卡状态机、双人规则与失败重试反馈"),
    ("mobile", "移动端工程师", "通信工程", "flutter,dart,offline-sync", "Flutter,Dart,离线同步", "outdoors", "户外活动", "徒步补给手册", "完成离线地图索引、移动端表单与同步冲突提示"),
    ("qa", "测试工程师", "质量工程", "playwright,property-testing,test-design", "Playwright,属性测试,测试设计", "inclusion", "数字包容", "表单体验检查器", "建立边界样例、复现记录与可读的失败报告"),
    ("devops", "运维与交付工程师", "网络工程", "docker,observability,ci-cd", "Docker,可观测性,持续交付", "open-source", "开源协作", "小团队发布台", "编写可重放部署、健康检查与回滚演练步骤"),
    ("security", "安全工程师", "信息安全", "threat-modeling,web-security,permission-design", "威胁建模,Web安全,权限设计", "privacy", "数据隐私", "授权记录小册", "绘制数据流、检查授权撤销并验证最小访问范围"),
    ("writer", "内容与文档作者", "传播学", "technical-writing,interviewing,information-design", "技术写作,采访,信息组织", "local-history", "地方记忆", "口述故事编辑台", "整理采访提纲、出处说明与分层阅读文档"),
    ("community", "社区运营", "社会学", "facilitation,community-ops,event-planning", "小组引导,社区运营,活动策划", "volunteering", "志愿协作", "志愿轮值排班板", "设计参与规则、反馈回路与新成员操作说明"),
    ("geospatial", "地理数据开发者", "地理信息", "qgis,postgis,cartography", "QGIS,PostGIS,地图制图", "mobility", "慢行交通", "骑行路线观察册", "校验空间数据、制作图层与可解释的路径说明"),
    ("audio", "声音交互设计师", "声音艺术", "web-audio,signal-processing,sound-design", "Web Audio,信号处理,声音设计", "music", "声音与音乐", "环境声音拼贴器", "制作声音采样界面、交互反馈与听觉替代提示"),
    ("researcher", "研究与实验设计者", "心理学", "experiment-design,survey-design,qualitative-coding", "实验设计,问卷设计,质性编码", "learning", "学习方法", "同伴学习观察簿", "写出研究问题、控制实验条件并区分观察与推断"),
    ("creative-coder", "创意编程者", "艺术与科技", "threejs,webgl,generative-art", "Three.js,WebGL,生成艺术", "exhibition", "公共展览", "城市光影交互墙", "实现实时视觉、输入映射与低性能设备降载"),
    ("sustainability", "可持续产品设计者", "工业设计", "service-design,lifecycle-analysis,cad", "服务设计,生命周期分析,CAD", "circularity", "循环利用", "闲置物品修理账本", "拆解维修流程、绘制部件方案并验证材料记录"),
    ("systems", "系统工程师", "计算机系统", "rust,protocol-design,performance-analysis", "Rust,协议设计,性能分析", "developer-tools", "开发者工具", "插件协作沙盒", "实现隔离接口、资源限额与可重现的基准测试"),
]
NAMES = ["林知夏", "陈远舟", "许若宁", "周映川", "沈星禾", "苏言初", "叶清岚", "陆予安", "江望舒", "顾南溪", "秦知微", "唐书白", "袁听澜", "吴景行", "徐时雨", "程云舒", "何沐青", "方逸辰", "宋可欣", "郑以南"]
CONTEXTS = ["校园社团", "街坊互助", "周末共学", "公益工作坊", "远程开源小组"]
COLLAB = [("async-first", "先写清问题和取舍，每天用短记录交接"), ("pairing", "关键问题结对推敲，结束前共同写下下一步"), ("small-milestones", "按半天可完成的小目标拆分，先约定验收样例"), ("prototype-first", "先用低成本原型试一次，再决定是否投入精修"), ("research-first", "先核对使用者需求与证据，再进入实现")]
COMM = [("written-summary", "偏好文字要点，较复杂的问题约十分钟语音"), ("scheduled-checkin", "每天固定一次同步，其余问题集中留言"), ("visual-explanation", "用草图和示例沟通，确认后再写决策记录"), ("issue-tracking", "讨论放在议题里，遇到阻塞会及时明确提出"), ("live-workshop", "启动时面对面讨论，后续异步反馈并标出截止点")]
TRAITS = [("沉稳", "重视证据"), ("好奇", "愿意试错"), ("耐心", "善于倾听"), ("主动", "偏好清晰边界"), ("细致", "关注可维护性")]
MBTI = ["INTJ", "INTP", "ENTJ", "ENTP", "INFJ", "INFP", "ENFJ", "ENFP", "ISTJ", "ISFJ", "ESTJ", "ESFJ", "ISTP", "ISFP", "ESTP", "ESFP"]

def attr(key, value, visibility="authenticated"):
    return {"key": key, "value": value, "visibility": visibility}

def labelled(code, label, **extra):
    return {"code": code, "label": label, **extra}

def date(value):
    return {"value": str(value), "precision": "year"}

def generate():
    people = []
    for n in range(1, 101):
        t = TRACKS[(n - 1) % 20]
        variant = (n - 1) // 20
        role, role_label, major, raw_codes, raw_labels, interest, interest_label, project, contribution = t
        codes, labels = raw_codes.split(","), raw_labels.split(",")
        extra = TRACKS[(n + 5 + variant) % 20]
        extra_code, extra_label = extra[3].split(",")[variant % 3], extra[4].split(",")[variant % 3]
        skills = list(zip(codes, labels))
        if extra_code not in codes:
            skills.append((extra_code, extra_label))
        if n == 100:
            skills.append(("wasm-component-model", "WebAssembly组件模型"))
        username = f"s7_sim_{n:03d}"
        nickname = f"模拟·{NAMES[(n - 1) % 20]}{n:02d}"
        context = CONTEXTS[variant]
        title = f"{context}·{project}{n:03d}"
        collab, comm = COLLAB[(n + variant) % 5], COMM[(2 * n + variant) % 5]
        goal = ["learn", "prototype", "validate", "demo", "maintain"][variant]
        goal_text = ["通过配对协作学习一次完整交付", "完成可操作原型并跑通关键场景", "验证目标使用者是否愿意持续使用", "做出可展示作品并解释技术取舍", "留下可继续维护的文档与测试"][variant]
        base_year = 2014 + n % 10
        values = [
            attr("real_name", f"虚构{NAMES[(n - 1) % 20]}{n:02d}", "private" if n % 10 == 3 else "authenticated"),
            attr("age_range", ["18_24", "25_34", "25_34", "35_44", "45_54"][variant]),
            attr("mbti", MBTI[(n - 1) % 16]),
            attr("personality", {"traits": list(TRAITS[(n + variant) % 5]), "self_description": f"模拟自述：{TRAITS[(n + variant) % 5][0]}地推进工作，{collab[1]}。在{context}项目中，会先询问队友的工作节奏。"}),
            attr("headline", f"模拟人物{n:03d}｜{role_label}，关注{interest_label}"),
            attr("bio", f"这是完全虚构的模拟人物，不对应真人。设定为{major}背景，曾在{context}完成《{title}》。我负责{contribution}，希望把{interest_label}的具体问题变成可验证的小作品。{comm[1]}，遇到分歧先讨论约束和可选方案。"),
            attr("direction", labelled(interest, interest_label)),
            *[attr("skill", labelled(c, label, self_level=["working", "proficient", "expert", "learning"][(j + variant) % 4])) for j, (c, label) in enumerate(skills)],
            attr("role", labelled(role, role_label)),
            attr("role", labelled(extra[0], extra[1], note="可以承担辅助角色，主责范围会先与队友确认")),
            attr("interest", labelled(interest, interest_label)),
            attr("interest", labelled(extra[5], extra[6])),
            attr("seeking", f"希望长期与熟悉{extra[6]}、愿意共同复盘的伙伴合作；偏好{context}的小步迭代，重视交接文档。"),
            attr("language", {"code": "zh-CN", "self_level": "native"}),
            attr("language", {"code": "en", "self_level": ["conversational", "working", "fluent"][n % 3]}),
            attr("city", ["上海", "杭州", "成都", "武汉", "广州", "西安", "南京", "深圳", "厦门", "青岛"][(n + variant) % 10]),
            attr("timezone", "Asia/Shanghai"),
            attr("collaboration_preference", {"codes": [collab[0]], "free_text": collab[1]}),
            attr("communication_preference", {"codes": [comm[0]], "free_text": comm[1]}, "friends" if n % 10 == 4 else "authenticated"),
            attr("education", {"school": f"虚构{['澄光', '溪桥', '云帆', '星野', '原点'][variant]}学院", "major": major, "degree": ["本科", "硕士", "本科", "专科及持续进修", "本科及行业进修"][variant], "summary": f"模拟教育经历：课程练习偏向{interest_label}，完成过{project}相关的小组实践。", "start": date(base_year), "end": date(base_year + 2)}),
            attr("project", {"title": title, "role": role_label, "contribution": f"模拟经历：{contribution}；承担第{variant + 1}阶段交付与文档整理。", "tech_codes": codes, "links": [f"https://example.org/s7/{username}/project"], "outcome": f"虚构演练结果：整理{12 + n % 29}个验收场景，记录{3 + n % 7}个待改进点；未对真实用户开展研究。", "start": date(2024 + n % 2), "end": date(2026)}),
            attr("portfolio_link", {"url": f"https://example.org/s7/{username}", "label": f"模拟作品目录{n:03d}"}),
        ]
        if n % 3 == 0:
            values.append(attr("work_experience", {"organization": f"虚构{context}工作室{n:03d}", "role": role_label, "summary": f"模拟实践：协助{contribution}，以每周复盘记录跨角色协作问题。", "start": date(2025), "end": date(2026)}))
        if n % 5 == 0:
            values.append(attr("award", {"title": f"模拟练习成果{n:03d}", "issuer": "虚构学习小组", "date": date(2026), "description": "仅供字段展示的虚构记录，不代表真实奖项或资格。"}))
        if n % 4 == 0:
            values.append(attr("portfolio_link", {"url": f"https://example.org/s7/{username}/notes", "label": "模拟协作复盘"}))
        if n % 5 == 1:
            values.append(attr("contact_email", f"{username}@example.invalid", ["authenticated", "friends", "private"][n % 3]))
        if n in (7, 27, 47, 67, 87):
            values.append(attr("skill", labelled("private-sentinel-skill", "不可公开的模拟技能", self_level="working"), "private"))
        if n in (8, 28, 48, 68, 88):
            values.append(attr("skill", labelled("friends-sentinel-skill", "仅好友可见的模拟技能", self_level="working"), "friends"))
        drafts = [attr("skill", labelled("draft-sentinel-skill", "未确认模拟技能", self_level="learning"))] if n % 10 == 5 else []
        if n % 10 == 5:
            drafts.append(attr("project", {"title": f"尚未确认的模拟构想{n:03d}", "contribution": "仅保存在编辑草稿，不能进入发现投影。"}))
        def event(alias):
            secondary = alias == "secondary"
            erole = extra if secondary else t
            ecodes = erole[3].split(",")
            day = "29" if secondary else "28"
            start_hour = 9 + (n % 4) * 2
            attrs = [
                attr("event_goal", {"codes": ["research" if secondary else goal], "free_text": f"第二活动单独设定：为{extra[6]}做访谈原型" if secondary else f"{goal_text}，围绕{title}安排可演示的范围。"}),
                attr("event_seeking", {"role_codes": [t[0] if secondary else extra[0]], "skill_codes": [codes[0] if secondary else extra_code], "free_text": f"需要队友帮助核对{'研究假设和访谈提纲' if secondary else '交互场景与关键验收样例'}；分工前沟通可投入时间。"}),
                attr("event_role", labelled(erole[0], erole[1])),
                attr("event_contribution", {"skill_codes": ecodes[:2], "free_text": f"本活动提供{erole[8]}，预留时间进行交接。"}),
                attr("event_time_commitment", {"hours_min": 2 + n % 4 if secondary else 6 + n % 5, "hours_max": 6 + n % 4 if secondary else 12 + n % 8, "period": "event", "note": "第二活动另约时间" if secondary else "主模拟活动两日总投入"}),
                attr("event_availability", {"starts_at": f"2026-11-{day}T{start_hour:02d}:00:00+08:00", "ends_at": f"2026-11-{day}T{start_hour + 4:02d}:00:00+08:00", "timezone": "Asia/Shanghai"}),
                attr("event_availability", {"starts_at": f"2026-11-{day}T20:00:00+08:00", "ends_at": f"2026-11-{day}T22:00:00+08:00", "timezone": "Asia/Shanghai"}),
                attr("event_collaboration_mode", {"mode": "online" if secondary else ["onsite", "online", "hybrid"][n % 3], "note": "模拟排期，需组队后再次确认"}),
                attr("event_presence", {"location_label": "第二模拟空间线上" if secondary else f"主模拟空间{1 + n % 5}组", "note": "没有真实线下活动地址"}),
                attr("event_contact_preference", {"codes": ["written-summary" if secondary else comm[0]], "free_text": "在活动内先用文字沟通，再约具体同步时段"}),
                attr("event_constraint", f"模拟约束{n:03d}：{'第二活动只投入独立研究支线' if secondary else '先完成约定范围，再讨论增加功能'}；不把其他Space安排视为本次承诺。", "private" if n % 20 == 9 else "authenticated"),
            ]
            if n % 6 == 0:
                attrs.append(attr("event_role", labelled("qa" if erole[0] != "qa" else "writer", "测试协作" if erole[0] != "qa" else "文档协作")))
            return {"discoverable": n not in ([90, 99] if secondary else [10, 20, 30, 40, 50, 60, 70, 80, 90, 99]), "attributes": attrs, "draft_attributes": [attr("event_role", labelled("draft-event-sentinel", "尚未确认的活动角色"))] if n % 10 == 5 else []}
        spaces = {"primary": event("primary")}
        if n >= 81:
            spaces["secondary"] = event("secondary")
        people.append({"number": n, "fixture_key": username, "username": username, "email": f"{username}@example.invalid", "nickname": nickname, "synthetic": True, "global": {"attributes": values, "draft_attributes": drafts}, "spaces": spaces})
    all_attrs = [a for p in people for s in [p["global"], *p["spaces"].values()] for a in s["attributes"]]
    drafts = [a for p in people for s in [p["global"], *p["spaces"].values()] for a in s["draft_attributes"]]
    data = {"dataset_id": DATASET, "schema_version": 1, "field_catalog_version": 2, "synthetic": True, "notice": "100名完全虚构的测试人物；confirmed仅表示模拟fixture经普通owner用例确认，不是真人确认、导入或AI结果。", "spaces": {"primary": {"name": "S7 模拟人物主活动（100人）", "description": "仅本机模拟：100名虚构人物，普通发现与权限验证；不对应真实活动。"}, "secondary": {"name": "S7 模拟人物第二活动（20人）", "description": "仅本机模拟：人物81–100独立活动偏好，用于验证Space隔离。"}}, "statistics": {"people": len(people), "space_members": {a: sum(a in p["spaces"] for p in people) for a in ("primary", "secondary")}, "discoverable": {a: sum(p["spaces"].get(a, {}).get("discoverable", False) for p in people) for a in ("primary", "secondary")}, "confirmed_attributes": len(all_attrs), "draft_attributes": len(drafts), "visibility": dict(sorted(Counter(a["visibility"] for a in all_attrs).items())), "field_counts": dict(sorted(Counter(a["key"] for a in all_attrs).items()))}, "boundary_cases": {"last_person": 100, "last_person_rare_skill": "wasm-component-model", "private_skill_people": [7, 27, 47, 67, 87], "friends_skill_people": [8, 28, 48, 68, 88], "draft_people": list(range(5, 101, 10)), "primary_optout": [10, 20, 30, 40, 50, 60, 70, 80, 90, 99], "secondary_optout": [90, 99]}, "people": people}
    return data

def main():
    data = generate()
    OUT.mkdir(parents=True, exist_ok=True)
    raw = (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode()
    (OUT / f"{DATASET}.json").write_bytes(raw)
    checksum = hashlib.sha256(raw).hexdigest()
    lines = ["# S7 固定模拟人物目录", "", "2026-11-12。下列100人完全虚构，不对应真人；学校、项目、成果均为模拟设定。JSON中的确认状态仅为fixture经本人用例写入的测试状态，不代表真人授权。", "", f"数据文件：[固定JSON]({DATASET}.json)。生成器：[profile_s7_people_generate.py](../../../backend/deploy/profile_s7_people_generate.py)。", "", f"内容 SHA-256 `{checksum}`。生成过程0次LLM、0次网络请求，不影响S6已有真实模型计量。", "", "## 字段与边界", "", "- 100人均加入primary；81–100另加入secondary且填写独立目标、角色、贡献、需求和时段。", "- primary恰好90人开启发现，10/20/30/40/50/60/70/80/90/99关闭；secondary18开启，90/99关闭。人物100开启且唯一拥有wasm-component-model技能。", "- 全局教育、项目、角色、4–5项技能、兴趣、性格自述、协作习惯、沟通习惯及作品映射P1字段；时区统一Asia/Shanghai。另有33条工作实践、20条模拟成果、25条第二作品链接和20条示例联系邮箱。", "- 人物7/27/47/67/87有private-sentinel-skill；8/28/48/68/88有friends-sentinel-skill；5/15/…/95有未确认技能与项目草稿。事件角色草稿保持未确认。", "- 末位3人物的真实姓名设定private；末位4人物的沟通偏好friends；9/29/49/69/89的活动约束private。联系方式独立范围，不参与普通发现字段。", "- 主活动时段为2026-11-28，每人独立连续4小时段，加20:00–22:00；第二活动改为2026-11-29。时段过滤可验证整段覆盖与间隙。", "- 未涉及的手机号、QQ、微信或二维码不编造；作品仅example.org，邮件仅example.invalid。昵称和简介均显式标记模拟。", "", f"确认字段数 `{data['statistics']['confirmed_attributes']}`，未确认草稿字段数 `{data['statistics']['draft_attributes']}`；确认字段范围分布 `{json.dumps(data['statistics']['visibility'], ensure_ascii=False, sort_keys=True)}`。", "", "## 人物目录", "", "|编号|模拟昵称|主角色|技能|关注方向|主发现|第二活动|", "|---|---|---|---|---|---|---|"]
    for p in data["people"]:
        attrs = p["global"]["attributes"]
        role = next(a["value"]["label"] for a in attrs if a["key"] == "role")
        skills = "、".join(a["value"]["label"] for a in attrs if a["key"] == "skill" and a["visibility"] == "authenticated")
        direction = next(a["value"]["label"] for a in attrs if a["key"] == "direction")
        lines.append(f"|{p['number']}|{p['nickname']}|{role}|{skills}|{direction}|{'开' if p['spaces']['primary']['discoverable'] else '关'}|{'独立偏好' if 'secondary' in p['spaces'] else '未加入'}|")
    lines += ["", "## 字段数量", "", "|P1字段|确认条数|", "|---|---|"]
    lines += [f"|{key}|{count}|" for key, count in data["statistics"]["field_counts"].items()]
    lines += ["", "## 本地安装与重放", "", "[安装器](../../../backend/deploy/profile_s7_people.php)仅允许CLI。它不建立数据库、不迁移模块、不修改真实用户，且不接受任意数据文件。目标必须明确指定humhub_preview或严格匹配humhub_profile_s7_test_*的本机克隆。需要已启用P1/P8/普通发现模块，以及现有管理员viewer-id。", "", "```sh", "PHP=backend/.runtime/php-mysql/bin/php", "$PHP -c backend/.runtime/php.ini backend/deploy/profile_s7_people_validate.php", "$PHP -c backend/.runtime/php.ini backend/deploy/profile_s7_people_guard_test.php", "$PHP -c backend/.runtime/php.ini backend/deploy/profile_s7_people.php inspect --target=humhub_profile_s7_test_EXPLICIT_SUFFIX --viewer-id=1", "$PHP -c backend/.runtime/php.ini backend/deploy/profile_s7_people.php seed --target=humhub_profile_s7_test_EXPLICIT_SUFFIX --viewer-id=1", "```", "", "将EXPLICIT_SUFFIX替换为已有克隆的实际小写后缀；示例命令不会自动创建克隆。主预览另须显式传入--confirm-preview=seed-synthetic-100和--backup-marker=完整备份目录/manifest.json。备份需位于backend/.runtime/backups内，与profile-s7-backup-path指针一致，且target、created_at_utc及同目录database.sql的SHA-256校验通过。备份文件内容不会写入报告。", "", "安装器先拒绝远程数据库、错误目标、非管理员viewer、未迁移模块、非文件传输mailer、已有同名但未登记拥有的账户/Space，以及会自动把新用户加入旧Space的原生设置。整个安装进程阻止队列入队、活动广播和邮件发送。账户口令来自random_bytes，立即交给原生Password保存后丢弃，不写manifest、不打印。", "", "私有进度账本在backend/.runtime/profile-s7/目标库/people-manifest.json，以随机GUID加记录ID确认拥有关系，不能通过昵称领用旧用户。原生账户、Space成员关系和P1身份/草稿/确认在每人独立事务内提交；普通发现开关使用独立ManageDiscoverySettings本人用例。已完成事务可从预登记GUID恢复；设置版本非零时保留当前值，既有画像、范围、开关和未确认草稿不被重置。若发现账户或Space被移除或换成其他记录，停止而不重建。", "", "inspect/seed输出不含口令的seq到user_id映射、两Space ID、当前成员和发现数、数据与当前内容哈希及创建/保留/恢复数量。首次安装以100/20成员、90/18发现为预期；之后使用者的明确修改可能改变当前数，重放不会强制恢复fixture初值。运行结果由集成和独立验收记录说明，本目录只说明数据和工具，不冒充数据库或HTTP验收报告。", "", "离线校验直接调用当前P1 FieldCatalog以及220个内存ProfileService草稿、确认、保留未确认流程；本机clone/主预览数据库安装和HTTP验收由主代理与独立验收任务执行。"]
    (OUT / f"{DATASET}.md").write_text("\n".join(lines) + "\n")
    print(json.dumps({"status": "generated", "sha256": checksum, **data["statistics"]}, ensure_ascii=False))

if __name__ == "__main__":
    main()
