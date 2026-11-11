#!/usr/bin/env python3
"""Generate documentation only: offline SVG, Mermaid sources and a reading page.

Uses only the Python standard library. Does not install or run HumHub,
connect to a database, or change application source/configuration.
"""
from pathlib import Path
from html import escape
import json

OUT = Path(__file__).resolve().parent
ROOT = OUT.parent.parent
VERSION = 'v1.19.4'
COMMIT = 'b8881d5ea7ee27384a33adeaa23100c73472c4ce'
DATE = '2026-11-11'
PALETTE = {
    'core': ('#edf5ff', '#3975ba'),
    'optional': ('#f5f0ff', '#8870bd'),
    'planned': ('#fff6e6', '#ba7b20'),
    'external': ('#f2f4f7', '#778397'),
}


def node(key, x, y, w, h, title, lines=(), kind='core'):
    return dict(key=key, x=x, y=y, w=w, h=h, title=title, lines=list(lines), kind=kind)


def edge(a, b, points, label='', at=None, dashed=False):
    return dict(a=a, b=b, points=points, label=label, at=at, dashed=dashed)


DIAGRAMS = [
    dict(
        id='01-runtime', title='运行结构：一个模块化的 PHP / Yii2 应用', height=900,
        subtitle='现有源码结构；服务、数据库和后台任务均尚未启动。',
        intro='先把 HumHub 理解成一个应用。用户、好友、Space、内容和通知是同一应用内的模块，不是多个微服务。当前实现使用 Controller、ActiveRecord、Behavior 和部分 Service；这张图不把它描述成已经完成的 Clean Architecture。',
        notes=['默认配置使用文件缓存与 MySQL 队列驱动，不把 Redis 画成已经配置的依赖。', '此次只复制核心仓库。REST 与 Messenger 是独立扩展，图中以紫色虚线标注，尚未下载或安装。'],
        sources=['index.php', 'protected/humhub/config/common.php', 'protected/humhub/config/web.php', 'protected/humhub/modules/queue/driver/MySQL.php'],
        nodes=[
            node('browser', 50, 135, 270, 105, '浏览器 / 原站页面', ['上游自带页面和 AJAX 请求'], 'external'),
            node('entry', 385, 135, 250, 105, 'index.php', ['加载配置，创建 Web 应用']),
            node('yii', 710, 135, 510, 105, 'Yii2 请求处理', ['路由、身份与访问规则 → Controller']),
            node('core', 50, 345, 780, 175, 'HumHub 核心模块（同一应用）', ['user / friendship / space', 'content / post / comment / like / file', 'stream / notification / activity / queue', '模型、Behavior、Service 与权限逻辑']),
            node('addons', 900, 345, 320, 175, '独立免费扩展 · 未下载', ['RESTful API', 'Messenger', '安装、接口适配均未执行'], 'optional'),
            node('db', 50, 650, 350, 110, '数据库', ['业务数据、成员关系、内容等', '尚未建库或迁移'], 'external'),
            node('files', 455, 650, 320, 110, '文件与缓存', ['uploads / 文件存储', '默认 FileCache'], 'external'),
            node('jobs', 830, 650, 390, 110, '控制台 / cron / queue', ['后台任务；默认 MySQL 队列驱动', '尚未配置或运行'], 'external'),
        ],
        edges=[
            edge('browser', 'entry', [(320, 187), (385, 187)], 'HTTP', (351, 166)),
            edge('entry', 'yii', [(635, 187), (710, 187)]),
            edge('yii', 'core', [(900, 240), (900, 290), (440, 290), (440, 345)], '调用模块', (650, 278)),
            edge('yii', 'addons', [(1080, 240), (1080, 345)], '安装后可扩展', (1148, 292), True),
            edge('addons', 'core', [(900, 435), (830, 435)], '', None, True),
            edge('core', 'db', [(220, 520), (220, 650)]),
            edge('core', 'files', [(610, 520), (610, 650)]),
            edge('core', 'jobs', [(780, 520), (780, 590), (1010, 590), (1010, 650)]),
        ],
    ),
    dict(
        id='02-data', title='核心数据关系：人、关系、空间与内容', height=1070,
        subtitle='概念关系简图，不是完整数据库 ER 约束清单。',
        intro='用户与 Space 都可以成为内容容器。帖子正文与通用内容元数据分开；评论和点赞再关联内容。好友和空间成员是两种独立关系。',
        notes=['user_friendship 使用两个方向的记录表示互相确认的好友关系，不能把单向记录直接当成已成为好友。', 'content 的 object_model / object_id 是多态关联，图中的线不全部代表数据库外键。', 'profile_field 是字段定义；不等于已经实现用户逐字段选择 authenticated / friends / private 的授权。'],
        sources=['protected/humhub/modules/user/models/User.php', 'protected/humhub/modules/user/models/Profile.php', 'protected/humhub/modules/user/models/ProfileField.php', 'protected/humhub/modules/friendship/models/Friendship.php', 'protected/humhub/modules/space/models/Membership.php', 'protected/humhub/modules/content/models/ContentContainer.php', 'protected/humhub/modules/content/models/Content.php', 'protected/humhub/modules/post/models/Post.php', 'protected/humhub/modules/comment/models/Comment.php', 'protected/humhub/modules/like/models/Like.php'],
        nodes=[
            node('user', 50, 140, 280, 105, 'user · 用户', ['账号、身份、资料入口']),
            node('membership', 455, 140, 290, 105, 'space_membership', ['user_id + space_id', '成员状态与空间角色']),
            node('space', 920, 140, 300, 105, 'space · 协作空间', ['自己的成员、权限和内容流']),
            node('profile', 50, 365, 280, 110, 'profile · 用户资料', ['通过 user_id 关联用户', '字段可由管理员配置']),
            node('container', 455, 365, 290, 110, 'contentcontainer', ['关联 User 或 Space', '统一承载内容归属']),
            node('friend', 50, 600, 280, 120, 'user_friendship', ['A → B：发送申请', 'A → B + B → A：好友']),
            node('content', 455, 600, 290, 135, 'content · 通用内容信息', ['容器、作者、状态、可见性', 'object_model / object_id']),
            node('post', 920, 600, 300, 135, 'post · 帖子正文', ['title / message 等', '继承 ContentActiveRecord']),
            node('fields', 50, 845, 280, 110, 'profile_field · 字段定义', ['类型、必填、可改、可搜索', '属于配置，不是个人授权']),
            node('addons', 455, 845, 290, 110, 'comment / like', ['通过 content_id 关联', '评论还可以有父评论']),
        ],
        edges=[
            edge('user', 'membership', [(330, 190), (455, 190)], '1 → 多', (392, 170)),
            edge('space', 'membership', [(920, 190), (745, 190)], '1 → 多', (832, 170)),
            edge('user', 'profile', [(190, 245), (190, 365)], '1 → 1', (230, 305)),
            edge('user', 'friend', [(50, 190), (20, 190), (20, 660), (50, 660)]),
            edge('user', 'container', [(300, 245), (300, 295), (505, 295), (505, 365)], '个人内容容器', (414, 280)),
            edge('space', 'container', [(1070, 245), (1070, 300), (695, 300), (695, 365)], '空间内容容器', (875, 284)),
            edge('container', 'content', [(600, 475), (600, 600)], '承载多条内容', (675, 542)),
            edge('content', 'post', [(745, 665), (920, 665)], '多态关联', (832, 643)),
            edge('content', 'addons', [(600, 735), (600, 845)], '1 → 多', (655, 795)),
            edge('fields', 'profile', [(330, 900), (380, 900), (380, 420), (330, 420)], '', None, True),
        ],
    ),
    dict(
        id='03-friendship', title='好友流程：同一关系在 A、B 两侧的状态', height=900,
        subtitle='示例固定由 A 先发起；换成 B 发起时完全对称。',
        intro='原版好友逻辑把单向申请和互相确认区分开。RequestController 的 add 同时承担发起和接受，delete 承担取消申请或解除关系。',
        notes=['原版 AJAX 操作会返回 FriendshipButton 的 HTML，不能直接当作已经为新 React 前端设计好的 JSON 接口。', '通知与 friendshipCreated / friendshipRemoved 事件可供其他逻辑响应。', '项目所需的来源验证和 expected_version 不在本图中冒充已完成，需要后续单独适配。'],
        sources=['protected/humhub/modules/friendship/models/Friendship.php', 'protected/humhub/modules/friendship/controllers/RequestController.php'],
        nodes=[
            node('none', 50, 165, 280, 135, '无关系', ['A：STATE_NONE', 'B：STATE_NONE', '无对应方向记录']),
            node('pending', 475, 165, 335, 145, '申请中 · 只有 A → B', ['A：STATE_REQUEST_SENT', 'B：STATE_REQUEST_RECEIVED', '两人尚未互相确认']),
            node('friends', 950, 165, 280, 145, '已成为好友', ['A、B：STATE_FRIENDS', 'A → B 与 B → A 均存在']),
            node('controller', 50, 570, 310, 135, 'RequestController', ['add：发起 / 接受', 'delete：拒绝 / 取消 / 解除', '原版页面与 AJAX 入口']),
            node('effects', 475, 570, 575, 135, '关系变化后的联动', ['申请通知、接受或拒绝通知', '接受后清理原申请通知', '建立与解除好友事件']),
        ],
        edges=[
            edge('none', 'pending', [(330, 220), (475, 220)], 'A 发起', (403, 197)),
            edge('pending', 'friends', [(810, 220), (950, 220)], 'B 接受', (879, 197)),
            edge('pending', 'none', [(640, 310), (640, 390), (190, 390), (190, 300)], 'A 撤回 / B 拒绝', (420, 372)),
            edge('friends', 'none', [(1090, 310), (1090, 470), (110, 470), (110, 300)], '解除好友关系', (775, 452)),
            edge('controller', 'effects', [(360, 638), (475, 638)], '调用模型', (417, 617)),
            edge('friends', 'effects', [(1160, 310), (1160, 638), (1050, 638)], '', None, True),
        ],
    ),
    dict(
        id='04-space', title='Space：成员状态、角色与加入策略', height=1070,
        subtitle='Space 更接近社群 / 项目协作小组，不等同于活动或即时聊天群。',
        intro='Space 拥有成员、权限和内容流。成员状态决定是否正式加入；角色决定加入后能做什么。加入策略与空间可见性也是分别配置的概念。',
        notes=['加入策略包含不允许自助加入、申请加入、自由加入。私有空间会限制加入策略；实际操作还要经过入口权限判断。', '所有者、管理员、版主、普通成员是角色，不是新的成员申请状态。', '退出或移除受规则限制；例如当前所有者不能直接按普通成员路径移除。', '原版没有你们的当前活动上下文与发现/推荐范围规则；本图没有把它们画成已有 Space 能力。'],
        sources=['protected/humhub/modules/space/models/Space.php', 'protected/humhub/modules/space/models/Membership.php', 'protected/humhub/modules/space/behaviors/SpaceModelMembership.php'],
        nodes=[
            node('none', 50, 155, 275, 110, '没有成员关系', ['尚未加入该 Space']),
            node('invited', 475, 155, 310, 125, '被邀请', ['STATUS_INVITED = 1', '等待被邀请人处理']),
            node('applied', 475, 410, 310, 125, '申请加入', ['STATUS_APPLICANT = 2', '等待空间管理员处理']),
            node('member', 925, 410, 305, 145, '正式成员', ['STATUS_MEMBER = 3', '成员关系与角色共同生效']),
            node('policy', 50, 410, 275, 145, '加入与可见性策略', ['JOIN_POLICY_*', 'VISIBILITY_*', '由入口与模型共同约束']),
            node('events', 475, 710, 310, 145, '成员变化联动', ['通知、活动记录', '成员缓存更新', '加入 / 移除事件']),
            node('roles', 925, 710, 305, 145, '空间角色', ['owner / admin', 'moderator / member', '决定管理与内容权限']),
        ],
        edges=[
            edge('none', 'invited', [(325, 210), (475, 210)], '授权者邀请', (400, 190)),
            edge('none', 'applied', [(325, 240), (385, 240), (385, 470), (475, 470)], '申请', (420, 450)),
            edge('invited', 'member', [(785, 215), (1070, 215), (1070, 410)], '接受邀请', (933, 195)),
            edge('applied', 'member', [(785, 470), (925, 470)], '批准申请', (855, 448)),
            edge('none', 'member', [(190, 155), (190, 110), (1195, 110), (1195, 410)], '自由加入 / 授权管理员直接添加', (713, 94)),
            edge('policy', 'applied', [(325, 515), (475, 515)], '', None, True),
            edge('member', 'roles', [(1080, 555), (1080, 710)]),
            edge('member', 'events', [(980, 555), (980, 640), (630, 640), (630, 710)]),
            edge('member', 'none', [(1230, 490), (1260, 490), (1260, 930), (20, 930), (20, 210), (50, 210)], '符合规则时退出 / 移除；申请与邀请也可取消', (650, 910)),
        ],
    ),
    dict(
        id='05-content', title='内容访问：权限判断与内容生命周期', height=1070,
        subtitle='上半部分是简化访问链；下半部分是常见状态路径，不是完整控制流。',
        intro='帖子正文由 Post 管理，通用 Content 负责归属、状态与可见性。读取、编辑和状态转换是不同检查，页面显示与否不能替代服务端判断。',
        notes=['canView 涉及访客、作者、内容状态和容器权限等分支；本图压缩显示，不能当作逐行实现或完整安全审计。', '未发布内容存在编辑者访问规则，查询层还会过滤状态；不要只靠前端隐藏草稿。', 'Content 的 PRIVATE 表示随容器解释的私有内容，例如空间成员内容或好友可见的个人内容；不能直接等同于项目画像 private（仅本人）。', '定时状态要求 scheduled_at。任务代码存在不代表当前已经运行定时发布。置顶、归档等属性也不等同于发布状态。'],
        sources=['protected/humhub/modules/post/models/Post.php', 'protected/humhub/modules/content/models/Content.php', 'protected/humhub/modules/content/components/ActiveQueryContent.php', 'protected/humhub/modules/content/services/ContentStateService.php'],
        nodes=[
            node('request', 50, 160, 280, 120, '请求入口', ['身份 / 操作权限', '由对应 Controller 处理']),
            node('content', 450, 160, 295, 120, '加载 Post / Content', ['归属个人或 Space', '作者、状态、可见性']),
            node('access', 905, 160, 320, 170, '服务端访问判断', ['canView：能否读取', 'canEdit：能否编辑', '结合身份、状态、容器规则']),
            node('allow', 450, 435, 295, 110, '允许对应操作', ['通过校验后读取或修改']),
            node('deny', 905, 435, 320, 110, '拒绝 / 不返回无权内容', ['具体响应由入口决定'], 'external'),
            node('draft', 50, 730, 250, 115, '草稿', ['STATE_DRAFT = 10']),
            node('scheduled', 355, 730, 250, 115, '定时发布', ['STATE_SCHEDULED = 20', '需要 scheduled_at']),
            node('published', 660, 730, 250, 115, '已发布', ['STATE_PUBLISHED = 1']),
            node('deleted', 965, 730, 265, 115, '已删除状态', ['STATE_DELETED = 100', '不等于已经物理删除']),
        ],
        edges=[
            edge('request', 'content', [(330, 220), (450, 220)]),
            edge('content', 'access', [(745, 220), (905, 220)]),
            edge('access', 'allow', [(970, 330), (970, 375), (595, 375), (595, 435)], '通过', (780, 357)),
            edge('access', 'deny', [(1120, 330), (1120, 435)], '不通过', (1173, 385)),
            edge('draft', 'scheduled', [(300, 785), (355, 785)]),
            edge('scheduled', 'published', [(605, 785), (660, 785)]),
            edge('published', 'deleted', [(910, 785), (965, 785)]),
            edge('draft', 'published', [(175, 845), (175, 925), (785, 925), (785, 845)], '也可直接发布；具体操作仍须校验权限', (480, 906)),
        ],
    ),
    dict(
        id='06-boundaries', title='接入与产品边界：哪些已有，哪些仍待建设', height=1220,
        subtitle='橙色是待开发说明，不代表已经改造 HumHub 或确定最终技术架构。',
        intro='Space、活动、想法、聊天会话要分别理解。当前仅完成原版下载与副本，没有安装扩展，没有实现下面的项目 API 或产品规则。',
        notes=['Space：有成员、角色、权限和内容流的协作容器。活动：邀请加入并切换的业务上下文；发现、筛选、搜索、推荐必须绑定服务端验证的当前活动。', '想法：用户提出的项目或合作意向；想法与 Space 的最终映射尚未决定。同一想法跨活动的讨论成员和消息不能串用。', '聊天会话：Messenger 的独立对象。关注想法、加入讨论、成为好友彼此独立；切活动不清除既有好友与私聊。', '公开帖子作者的合法联系入口可以跨活动，但不是全站人物检索。', '新接口应面向普通用户用例复用核心逻辑；不能把管理员令牌交给浏览器，也不能让模型自行认定用户已授权。', '本文不修改项目既有技术方案；PHP/Yii2 是这份上游副本的事实，橙色区域是产品缺口而非已批准的部署拆分。'],
        sources=['protected/humhub/modules/space/models/Space.php', 'protected/humhub/modules/friendship/controllers/RequestController.php', 'protected/humhub/modules/user/models/ProfileField.php', 'protected/humhub/modules/content/models/Content.php'],
        nodes=[
            node('frontend', 50, 155, 340, 125, '自定义 React 前端 · 计划', ['Shadcn UI Kit + affectUI', '本次没有创建前端'], 'planned'),
            node('api', 500, 155, 720, 125, '面向普通用户的业务接口 · 待建设', ['/api/v1；身份与资格、活动范围、字段披露', '复用已有逻辑，补齐项目用例与版本冲突处理'], 'planned'),
            node('core', 50, 430, 340, 155, 'HumHub 核心 · 已复制', ['用户、好友、Space', '内容、通知、文件', '现有 PHP / Yii2 代码']),
            node('rest', 500, 430, 310, 155, 'REST 扩展 · 未下载', ['已有公开实现', '普通用户 API 覆盖需审查', '不能假定所有接口可直连'], 'optional'),
            node('mail', 910, 430, 310, 155, 'Messenger · 未下载', ['私聊与多人会话', '会话与 Space 是不同对象', '未安装，也没有运行'], 'optional'),
            node('event', 50, 795, 360, 190, '活动 · 待开发', ['邀请加入 + 当前活动上下文', '发现 / 搜索 / 推荐限定范围', '切换不清除好友与既有私聊', '不能只靠前端过滤'], 'planned'),
            node('idea', 455, 795, 350, 190, '想法 / 讨论 · 待开发', ['想法独立于好友关系', '讨论成员和消息按活动隔离', '与 Space 的映射尚未决定', '项目 Agent 尚未实现'], 'planned'),
            node('ai', 850, 795, 370, 190, '画像与 AI · 待开发', ['本人导入 → 抽取 → 用户确认', '仅确认资料按选择范围展示', '全局画像与活动偏好分开', '原始资料不作为公开画像'], 'planned'),
        ],
        edges=[
            edge('frontend', 'api', [(390, 217), (500, 217)], '计划调用', (445, 195), True),
            edge('api', 'core', [(550, 280), (550, 345), (220, 345), (220, 430)], '待适配', (385, 327), True),
            edge('api', 'rest', [(700, 280), (700, 430)], '评估后接入', (775, 359), True),
            edge('api', 'mail', [(1070, 280), (1070, 430)], '评估后接入', (1144, 359), True),
        ],
    ),
]


def text_width(text, size):
    return sum(size if ord(c) > 255 else size * 0.57 for c in text)


def svg_text(x, y, text, size=15, weight=400, color='#334155', anchor='start'):
    return '<text x="%s" y="%s" font-size="%s" font-weight="%s" fill="%s" text-anchor="%s">%s</text>' % (x, y, size, weight, color, anchor, escape(text))


def render_svg(d):
    # A square intrinsic canvas also renders completely in macOS Quick Look,
    # whose SVG thumbnail renderer otherwise crops wide diagrams.
    h = max(1280, d['height'])
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="{h}" viewBox="0 0 1280 {h}" role="img" aria-labelledby="title desc">', '<title id="title">'+escape(d['title'])+'</title>', '<desc id="desc">'+escape(d['intro'])+'</desc>', '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b"/></marker></defs>', '<rect width="1280" height="100%" fill="#ffffff"/>', '<g font-family="PingFang SC, Microsoft YaHei, Noto Sans CJK SC, Arial, sans-serif">', svg_text(50, 45, d['title'], 25, 650, '#16243b'), svg_text(50, 77, d['subtitle'], 14, 400, '#53657b')]
    for e in d['edges']:
        pts = ' '.join(f'{x},{y}' for x, y in e['points'])
        dash = ' stroke-dasharray="7 5"' if e['dashed'] else ''
        parts.append(f'<polyline points="{pts}" fill="none" stroke="#64748b" stroke-width="2" stroke-linejoin="round" marker-end="url(#arrow)"{dash}/>')
    for n in d['nodes']:
        x, y, w, nh = (n[k] for k in ('x', 'y', 'w', 'h'))
        fill, stroke = PALETTE[n['kind']]
        dash = ' stroke-dasharray="7 5"' if n['kind'] in ('optional', 'planned') else ''
        parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{nh}" rx="12" fill="{fill}" stroke="{stroke}" stroke-width="1.8"{dash}/>')
        title_size = min(17, (w-34) / max(1, text_width(n['title'], 1)))
        parts.append(svg_text(x+17, y+31, n['title'], round(title_size, 2), 650, '#1c304b'))
        for j, line in enumerate(n['lines']):
            size = min(14, (w-34) / max(1, text_width(line, 1)))
            parts.append(svg_text(x+17, y+59+j*22, line, round(size, 2)))
    for e in d['edges']:
        if e['label'] and e['at']:
            x, y = e['at']; width = text_width(e['label'], 12.5) + 14
            parts.append(f'<rect x="{x-width/2}" y="{y-15}" width="{width}" height="22" rx="4" fill="white"/>')
            parts.append(svg_text(x, y, e['label'], 12.5, 500, '#475569', 'middle'))
    bottom = max([n['y'] + n['h'] for n in d['nodes']] + [y for e in d['edges'] for _, y in e['points']])
    reminder_lines = []
    for number, note in enumerate(d['notes'][:2], 1):
        line = str(number) + '. '
        for char in note:
            if text_width(line + char, 13) > 1110:
                reminder_lines.append(line)
                line = '   ' + char
            else:
                line += char
        reminder_lines.append(line)
    reminder_y = bottom + 35
    reminder_h = 52 + 22 * len(reminder_lines)
    assert reminder_y + reminder_h < h - 80, 'Reminder exceeds canvas: ' + d['id']
    parts.append(f'<rect x="50" y="{reminder_y}" width="1180" height="{reminder_h}" rx="10" fill="#f8fafc" stroke="#e2e8f0"/>')
    parts.append(svg_text(68, reminder_y + 27, '读图提醒', 14, 650, '#334155'))
    for i, line in enumerate(reminder_lines):
        parts.append(svg_text(68, reminder_y + 51 + 22 * i, line, 13, 400, '#53657b'))
    parts.append(f'<path d="M 50 {h-66} H 1230" stroke="#e2e8f0"/>')
    lx=50
    for kind, label in [('core', '原版源码已有'), ('optional', '独立扩展，未下载'), ('planned', '本项目待开发'), ('external', '运行环境 / 外部')]:
        fill, stroke=PALETTE[kind]
        parts.append(f'<rect x="{lx}" y="{h-44}" width="14" height="14" rx="3" fill="{fill}" stroke="{stroke}"/>')
        parts.append(svg_text(lx+22, h-32, label, 12))
        lx += 245
    parts.append(svg_text(1230, h-11, f'HumHub {VERSION} · {COMMIT[:12]} · 源码阅读图，未运行验证', 10.5, 400, '#64748b', 'end'))
    parts.append('</g></svg>')
    return '\n'.join(parts)


def render_mermaid(d):
    lines=['%% '+d['title'], '%% 与 SVG 使用同一节点和关系数据；布局由 Mermaid 决定。', 'flowchart TB']
    for n in d['nodes']:
        label='<br/>'.join([n['title']]+n['lines']).replace('"', '&quot;')
        lines.append(f'  {n["key"]}["{label}"]:::{n["kind"]}')
    for e in d['edges']:
        op='-.->' if e['dashed'] else '-->'
        label='|"'+e['label'].replace('"','&quot;')+'"|' if e['label'] else ''
        lines.append(f'  {e["a"]} {op}{label} {e["b"]}')
    for kind, (fill, stroke) in PALETTE.items():
        lines.append(f'  classDef {kind} fill:{fill},stroke:{stroke},color:#1c304b')
    return '\n'.join(lines)+'\n'


def render_readme():
    lines=['# HumHub 后端阅读图', '', '**范围：原版源码阅读辅助，不是项目后端已经实现的说明。**', '', f'- 基线：HumHub {VERSION}，提交 {COMMIT}。', '- 原版保存在 references/humhub；backend 是包含 Git 元数据的独立文件副本。', '- 本次新增内容只在 docs/architecture；没有修改上游应用代码、配置或依赖。', '- 没有安装依赖、建库、迁移、启动应用或安装 REST / Messenger 扩展。', '- 这次使用项目 architecture-patterns 技能区分已有实现、接口边界和待开发业务，不把原版 MVC / ActiveRecord 结构改画成已实现的分层重构。', '', '[离线图册：直接用浏览器打开](index.html)', '', '## 先区分四个概念', '', '| 概念 | 含义 | 当前副本状态 |', '|---|---|---|', '| Space | 有成员、角色、权限和内容流的社群 / 项目协作空间 | 核心已有源码 |', '| 活动 | 邀请加入、切换当前活动，并限制发现 / 搜索 / 推荐范围的业务上下文 | 本项目待开发 |', '| 想法 | 用户发起的项目或合作意向，可有按活动隔离的讨论 | 本项目待开发；与 Space 的映射未决定 |', '| 聊天会话 | 私聊或多人聊天的消息与参与者集合 | 独立 Messenger 扩展；本次未下载 |', '', 'Space 更接近群组 / 社区小组，但不是即时聊天群。可以借用它的成员与权限能力建设活动功能，不能把改名当作已经实现活动规则。', '', '图例：蓝色为原版源码已有，紫色虚线为未下载的独立扩展，橙色虚线为待开发，灰色为运行环境。所有箭头表示结构或流程，不代表应用当前已在运行。', '']
    for d in DIAGRAMS:
        lines += ['## '+d['title'], '', d['intro'], '', f'![{d["title"]}]({d["id"]}.svg)', '', f'[打开 SVG]({d["id"]}.svg) · [Mermaid 源文件]({d["id"]}.mmd)', '', '阅读要点：', '']
        lines += ['- '+n for n in d['notes']]
        lines += ['', '本地源码依据：', '']
        lines += [f'- [{p}](../../{p})' for p in d['sources']]
        lines += ['']
    lines += ['## 来源与检查边界', '', '- [上游 HumHub 仓库](https://github.com/humhub/humhub/tree/v1.19.4)。', '- [REST 扩展仓库](https://github.com/humhub/humhub-modules-rest)与[Messenger 扩展仓库](https://github.com/humhub/humhub-modules-mail)是独立来源，不在本次副本中。', '- 项目特有规则仅按本轮用户要求和根目录 AGENTS.md 标为待开发；没有修改或取代当前设计文档。', '- 图 2 是关系说明，不承诺列出全部字段、索引或数据库外键；图 5 是访问概念简图，不是完整权限审计。', '- 本轮检查图形、相对链接和上游文件一致性。没有声称通过 PHP 应用测试、数据库测试或生产验证。', '', '## 维护图稿', '', '修改本目录 render_diagrams.py 中的 DIAGRAMS 后，以 Python 3 运行该文件，可同时重生成 SVG、Mermaid、图册和本文。只使用 Python 标准库，输出范围限制在本目录。', '', f'记录日期：{DATE}（Asia/Shanghai）。', '']
    return '\n'.join(lines)


def render_html():
    cards=[]
    for d in DIAGRAMS:
        notes=''.join('<li>'+escape(n)+'</li>' for n in d['notes'])
        sources=''.join('<li><a href="../../'+escape(p)+'">'+escape(p)+'</a></li>' for p in d['sources'])
        cards.append('<section id="'+d['id']+'"><h2>'+escape(d['title'])+'</h2><p>'+escape(d['intro'])+'</p><div class="figure"><img src="'+d['id']+'.svg" alt="'+escape(d['title'])+'" loading="eager"></div><p class="links"><a href="'+d['id']+'.svg">单独打开 SVG</a> · <a href="'+d['id']+'.mmd">Mermaid 源文件</a></p><ul>'+notes+'</ul><details><summary>本地源码依据</summary><ul class="sources">'+sources+'</ul></details></section>')
    nav=''.join('<a href="#'+d['id']+'">'+escape(d['title'].split('：')[0])+'</a>' for d in DIAGRAMS)
    return '''<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>HumHub 后端阅读图</title>
<style>
:root{color-scheme:light;font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif;color:#243449;background:#f4f6f9}*{box-sizing:border-box}body{margin:0}main{max-width:1320px;margin:auto;padding:40px 28px 64px}h1{font-size:32px;color:#15243a;margin:0 0 14px}h2{font-size:23px;color:#15243a}p,li{line-height:1.8}a{color:#245f9f;text-underline-offset:3px}header{padding:0 8px 20px}.meta{font-size:13px;color:#63738a}.scope{border-left:4px solid #b77b21;padding:12px 16px;background:#fff5e4;border-radius:6px}.concepts{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:22px 0}.concepts div{background:white;border:1px solid #dce4ed;border-radius:10px;padding:16px}.concepts strong{display:block;color:#15243a;margin-bottom:8px}.concepts span{font-size:14px;line-height:1.7;display:block}nav{display:flex;flex-wrap:wrap;gap:10px;margin:20px 0}nav a{padding:8px 12px;border:1px solid #dce4ed;border-radius:8px;background:white;text-decoration:none;font-size:14px}section{background:#fff;border:1px solid #dce4ed;border-radius:14px;padding:22px;margin:24px 0;scroll-margin-top:20px}.figure{background:white;overflow:auto;border:1px solid #edf0f5;border-radius:8px}.figure img{display:block;width:100%;min-width:820px;height:auto}.links{font-size:14px}details{border-top:1px solid #e5eaf0;padding-top:14px;margin-top:18px;font-size:13px}summary{cursor:pointer;font-weight:600}.sources{overflow-wrap:anywhere}footer{font-size:13px;color:#66778d}a:focus-visible,summary:focus-visible{outline:3px solid #b5d8fa;outline-offset:4px}@media(max-width:800px){main{padding:24px 12px}.concepts{grid-template-columns:repeat(2,1fr)}section{padding:14px}h1{font-size:27px}}@media print{body{background:white}main{max-width:none;padding:0}nav,.links,details{display:none}section{break-before:page;border:0;padding:0}.figure{overflow:visible;border:0}.figure img{min-width:0}.concepts{grid-template-columns:repeat(4,1fr)}}
</style></head><body><main><header><h1>HumHub 后端阅读图</h1>
<p>从原版源码理解现有能力，再看新前端与项目规则需要补什么。</p>
<p class="meta">HumHub '''+VERSION+' · '+COMMIT[:12]+' · '+DATE+'''</p>
<p class="scope">当前仅下载并复制源码，新增本目录图稿。未安装依赖、建库或启动应用；REST 与 Messenger 尚未下载。橙色区域均为待开发说明。</p>
<div class="concepts"><div><strong>Space · 已有源码</strong><span>有成员、角色、权限和内容流的社群 / 协作小组。</span></div><div><strong>活动 · 待开发</strong><span>邀请加入并切换的业务上下文，限定发现、搜索和推荐范围。</span></div><div><strong>想法 · 待开发</strong><span>项目或合作意向。讨论按活动隔离，与 Space 的映射未决定。</span></div><div><strong>聊天会话 · 扩展未下载</strong><span>Messenger 的私聊 / 多人聊天对象，不等同于 Space。</span></div></div>
<nav aria-label="图册目录">'''+nav+'''</nav></header>'''+''.join(cards)+'''<footer><p>可离线阅读，无外部字体、脚本或 CDN。蓝色：原版已有；紫色：独立扩展未下载；橙色：待开发；灰色：环境。</p><p>这是源码阅读辅助，不表示目标应用已实现或已通过运行测试。详见同目录 README.md 与 SOURCE.json。</p></footer></main></body></html>'''


def main():
    for d in DIAGRAMS:
        keys={n['key'] for n in d['nodes']}
        assert len(keys)==len(d['nodes'])
        for e in d['edges']:
            assert e['a'] in keys and e['b'] in keys
        for p in d['sources']:
            assert (ROOT/p).is_file(), 'Missing local source: '+p
        (OUT/(d['id']+'.svg')).write_text(render_svg(d), encoding='utf-8')
        (OUT/(d['id']+'.mmd')).write_text(render_mermaid(d), encoding='utf-8')
    (OUT/'README.md').write_text(render_readme(), encoding='utf-8')
    (OUT/'index.html').write_text(render_html(), encoding='utf-8')
    (OUT/'SOURCE.json').write_text(json.dumps({'upstream':'https://github.com/humhub/humhub.git','tag':VERSION,'commit':COMMIT,'date':DATE,'timezone':'Asia/Shanghai','reference_directory':'../../../references/humhub','backend_directory':'../..','scope':'Source copy plus documentation only; no application changes or execution','optional_modules_installed':[],'diagrams':[d['id'] for d in DIAGRAMS]},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Generated 6 SVGs, 6 Mermaid sources, index.html, README.md and SOURCE.json in '+str(OUT))


if __name__=='__main__':
    main()
