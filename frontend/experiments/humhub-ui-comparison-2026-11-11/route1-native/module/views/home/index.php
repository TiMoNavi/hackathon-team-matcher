<?php
use yii\helpers\Html;
use yii\helpers\Json;
$e = static fn($value) => Html::encode((string)$value);
$icons = ['发现' => 'compass', '广场' => 'th-large', '消息' => 'comment-o', '个人' => 'user-o'];
?>
<div class="cn-shell" id="native-comparison" data-testid="route1-root">
    <aside class="cn-sidebar" aria-label="主导航">
        <a href="#" class="cn-brand" data-home>
            <span class="cn-brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
            <span>同频<span class="cn-wordmark">CoLab</span></span>
        </a>
        <div class="cn-workspace-label">一起，把想法变成现实</div>
        <nav class="cn-nav">
            <?php foreach ($icons as $label => $icon): ?>
            <button type="button" class="cn-nav-item <?= $label === '发现' ? 'is-active' : '' ?>" data-nav="<?= $e($label) ?>" <?= $label === '发现' ? 'aria-current="page"' : '' ?>>
                <i class="fa fa-<?= $e($icon) ?>" aria-hidden="true"></i><span><?= $e($label) ?></span>
                <?php if ($label === '发现'): ?><span class="cn-nav-dot" aria-hidden="true"></span><?php endif; ?>
                <?php if ($label === '消息'): ?><span class="cn-nav-count">3</span><?php endif; ?>
            </button>
            <?php endforeach; ?>
        </nav>
        <div class="cn-sidebar-divider"></div>
        <div class="cn-small-label">当前活动</div>
        <button class="cn-event-switch" type="button" data-event>
            <span class="cn-event-symbol" aria-hidden="true">✦</span>
            <span><strong><?= $e($demo['event']['name']) ?></strong><small>2026 / 11 · 创造者计划</small></span>
            <i class="fa fa-angle-down" aria-hidden="true"></i>
        </button>
        <div class="cn-sidebar-bottom">
            <div class="cn-help-card"><span class="cn-help-star" aria-hidden="true">✧</span><strong>好合作，从了解彼此开始</strong><p>完善你的协作偏好，让合适的队友更容易找到你。</p><button type="button" data-open-preferences>完善协作偏好 <i class="fa fa-arrow-right" aria-hidden="true"></i></button></div>
            <div class="cn-account"><span class="cn-mini-avatar">舟</span><span><strong>林舟</strong><small>保持好奇，持续创造</small></span><button type="button" aria-label="账户选项" data-account><i class="fa fa-ellipsis-h" aria-hidden="true"></i></button></div>
        </div>
    </aside>
    <div class="cn-main">
        <header class="cn-topbar">
            <div class="cn-breadcrumb"><span>工作空间</span><i class="fa fa-angle-right" aria-hidden="true"></i><strong>发现</strong></div>
            <div class="cn-topbar-actions"><span class="cn-today"><span></span>一个适合创造的周末</span><button type="button" class="cn-icon-button" aria-label="查看通知" data-notifications><i class="fa fa-bell-o" aria-hidden="true"></i><b aria-hidden="true"></b></button><span class="cn-top-avatar">舟</span></div>
        </header>
        <main class="cn-workspace">
            <div class="cn-heading"><div><span class="cn-eyebrow">MEET YOUR NEXT COLLABORATOR</span><h1><?= $e($demo['greeting']) ?><span class="cn-title-spark" aria-hidden="true">✳</span></h1><p><?= $e($demo['subtitle']) ?></p></div><span class="cn-route-pill"><span></span>原生主题 · 路线 01</span></div>
            <section class="cn-hero" aria-labelledby="cn-event-title">
                <div class="cn-hero-copy"><span class="cn-live-pill"><i></i><?= $e($demo['event']['phase']) ?></span><h2 id="cn-event-title"><?= $e($demo['event']['name']) ?></h2><p>48 小时，把「如果可以」变成「我们做到了」。<br>找到互补的伙伴，从一次对话开始。</p><button class="btn cn-primary-button" type="button" data-explore>寻找我的队友 <i class="fa fa-arrow-right" aria-hidden="true"></i></button><span class="cn-location"><i class="fa fa-map-marker" aria-hidden="true"></i><?= $e($demo['event']['city']) ?></span></div>
                <div class="cn-hero-art" aria-hidden="true"><div class="cn-orbit cn-orbit-one"></div><div class="cn-orbit cn-orbit-two"></div><div class="cn-creative-symbol"><span></span><span></span><span></span><span></span></div><div class="cn-art-label cn-art-label-one"><span>✧</span>让灵感发生连接</div><div class="cn-art-label cn-art-label-two"><span class="cn-mini-dot"></span>BUILD SOMETHING GREAT</div><span class="cn-art-star">✳</span></div>
                <div class="cn-hero-stats"><div><strong><?= $e($demo['event']['participants']) ?><span>位</span></strong><small>有趣的创造者</small></div><div><strong><?= $e($demo['event']['ideas']) ?><span>个</span></strong><small>等待回应的想法</small></div><div><strong><?= $e($demo['event']['teams']) ?><span>支</span></strong><small>正在成形的队伍</small></div><div class="cn-hero-note"><span class="cn-face-stack"><i>林</i><i>许</i><i>陈</i></span><small>下一位搭档，可能就在这里</small></div></div>
            </section>
            <div class="cn-content-layout">
                <section class="cn-members" aria-labelledby="cn-members-title">
                    <div class="cn-section-heading"><div><h2 id="cn-members-title">值得认识的新伙伴 <span>FOR YOU</span></h2><p>在同一场活动里，找到能一起前进的人。</p></div><span class="cn-result-count" data-count aria-live="polite">4 位伙伴</span></div>
                    <div class="cn-search-row"><label class="cn-search"><i class="fa fa-search" aria-hidden="true"></i><input type="search" placeholder="搜索姓名、技能或兴趣…" aria-label="搜索姓名或技能" data-testid="member-search" data-search><kbd>/</kbd></label><button type="button" class="cn-filter-settings" aria-label="查看筛选说明" data-filter-help><i class="fa fa-sliders" aria-hidden="true"></i></button></div>
                    <div class="cn-role-filters" role="group" aria-label="按角色筛选">
                        <?php foreach (['全部','前端','后端','设计','产品'] as $role): ?><button type="button" class="<?= $role === '全部' ? 'is-active' : '' ?>" data-role="<?= $e($role) ?>" data-role-filter="<?= $e($role) ?>" aria-pressed="<?= $role === '全部' ? 'true' : 'false' ?>"><?= $e($role) ?></button><?php endforeach; ?>
                    </div>
                    <div class="row g-3 cn-members-grid" data-member-grid>
                        <?php foreach ($demo['members'] as $member): ?>
                        <div class="col-sm-6 cn-member-cell" data-member="<?= $e($member['id']) ?>" data-member-id="<?= $e($member['id']) ?>" data-testid="member-card" data-searchable="<?= $e(mb_strtolower($member['name'].' '.$member['role'].' '.implode(' ', $member['skills']))) ?>" data-member-role="<?= $e($member['role']) ?>">
                            <article class="panel panel-default cn-member-card">
                                <div class="cn-member-top"><span class="cn-avatar cn-avatar-<?= $e($member['color']) ?>" aria-hidden="true"><?= $e($member['initial']) ?><span></span></span><button type="button" class="cn-follow" data-follow="<?= $e($member['id']) ?>" data-testid="member-follow-<?= $e($member['id']) ?>" aria-label="关注<?= $e($member['name']) ?>" aria-pressed="false"><i class="fa fa-plus" aria-hidden="true"></i></button></div>
                                <div class="cn-member-identity"><h3><?= $e($member['name']) ?></h3><span><?= $e($member['role']) ?></span><small><i class="fa fa-bolt" aria-hidden="true"></i><?= $e($member['match']) ?>% 同频</small></div>
                                <p class="cn-member-headline"><?= $e($member['headline']) ?></p>
                                <div class="cn-skill-tags"><?php foreach ($member['skills'] as $skill): ?><span><?= $e($skill) ?></span><?php endforeach; ?></div>
                                <div class="cn-member-footer"><span><i></i><?= $e($member['availability']) ?></span><button type="button" data-detail="<?= $e($member['id']) ?>" data-testid="member-details-<?= $e($member['id']) ?>" aria-label="查看<?= $e($member['name']) ?>的详情">认识一下 <i class="fa fa-arrow-up" aria-hidden="true"></i></button></div>
                            </article>
                        </div>
                        <?php endforeach; ?>
                    </div>
                    <div class="cn-empty" data-empty hidden><span aria-hidden="true">⌕</span><h3>还没有找到符合条件的伙伴</h3><p>换一个关键词，或看看全部角色。</p><button type="button" data-reset>清除筛选</button></div>
                    <section class="cn-ideas" aria-labelledby="cn-ideas-title"><div class="cn-section-heading"><div><h2 id="cn-ideas-title">正在发芽的想法 <span>OPEN IDEAS</span></h2><p>一个值得投入的开始，也许正在等你。</p></div><button type="button" data-more-ideas>去广场看看 <i class="fa fa-arrow-right" aria-hidden="true"></i></button></div><div class="cn-idea-grid">
                    <?php foreach ($demo['ideas'] as $n => $idea): ?><article class="cn-idea-card"><span class="cn-idea-icon cn-idea-icon-<?= $n ?>" aria-hidden="true"><?= $n ? '✦' : '↗' ?></span><div><span class="cn-idea-category"><?= $e($idea['category']) ?></span><h3><?= $e($idea['title']) ?></h3><p><?= $e($idea['description']) ?></p><span class="cn-looking"><i></i><?= $e($idea['lookingFor']) ?></span></div></article><?php endforeach; ?>
                    </div></section>
                </section>
                <aside class="cn-right-rail" aria-label="活动与协作提示">
                    <section class="cn-activity-card"><div class="cn-rail-heading"><h2>这场活动，你已在场</h2><span>✦</span></div><div class="cn-weekend-date"><span>11</span><div><strong>创造者周末</strong><small>NOVEMBER · 2026</small></div><span class="cn-date-label">进行中</span></div><div class="cn-timeline"><div class="is-done"><i></i><p>遇见同频的人<small>完善偏好，了解彼此</small></p><span>今天</span></div><div class="is-current"><i></i><p>让队伍开始成形<small>回应想法，开启协作</small></p></div><div><i></i><p>把想法带到现实<small>一起动手，展示成果</small></p></div></div><button type="button" class="cn-outline-button" data-event>查看活动详情 <i class="fa fa-arrow-up" aria-hidden="true"></i></button></section>
                    <section class="cn-checklist-card"><div class="cn-rail-heading"><h2>准备好，一起出发</h2><span class="cn-progress-count" data-progress-count>1/3</span></div><div class="progress cn-progress"><div class="progress-bar" role="progressbar" aria-label="协作准备完成度" aria-valuenow="33" aria-valuemin="0" aria-valuemax="100" style="width:33%" data-progress-bar></div></div><label><input type="checkbox" checked data-step><span>填写你的协作偏好</span><i class="fa fa-check" aria-hidden="true"></i></label><label><input type="checkbox" data-step><span>认识一位新伙伴</span><i class="fa fa-check" aria-hidden="true"></i></label><label><input type="checkbox" data-step><span>找到感兴趣的想法</span><i class="fa fa-check" aria-hidden="true"></i></label><p>每一小步，都让好合作更近一点。</p></section>
                    <section class="cn-note-card"><span aria-hidden="true">“</span><p>最好的作品，<br>往往始于一句<br><strong>「要不要一起试试？」</strong></p><small>给所有保持好奇的创造者</small><div class="cn-note-doodle" aria-hidden="true">✳</div></section>
                </aside>
            </div>
            <footer class="cn-demo-footer"><span><i class="fa fa-code" aria-hidden="true"></i>交互演示 · 非真实成员数据</span><span>PHP 视图 · HumHub 1.19 · Bootstrap 5</span></footer>
        </main>
    </div>
    <nav class="cn-mobile-nav" aria-label="移动端导航"><?php foreach ($icons as $label => $icon): ?><button type="button" class="<?= $label === '发现' ? 'is-active' : '' ?>" data-nav="<?= $e($label) ?>"><i class="fa fa-<?= $e($icon) ?>" aria-hidden="true"></i><span><?= $e($label) ?></span></button><?php endforeach; ?></nav>
    <dialog role="dialog" class="cn-detail-dialog" data-dialog aria-labelledby="cn-dialog-title"><div class="cn-detail-banner"><span>MEET YOUR COLLABORATOR</span><button type="button" data-close-dialog aria-label="关闭详情"><i class="fa fa-times" aria-hidden="true"></i></button></div><div class="cn-detail-body"><span class="cn-avatar" data-detail-avatar></span><div class="cn-detail-heading"><h2 id="cn-dialog-title" data-detail-name></h2><span data-detail-role></span></div><p data-detail-headline></p><div class="cn-skill-tags" data-detail-skills></div><div class="cn-detail-availability"><i></i><span data-detail-availability></span></div><div class="cn-detail-note">这是本次活动的演示伙伴资料。关注和交流操作仅用于本地界面验证，不会向任何真实用户发送消息。</div><button type="button" class="btn cn-primary-button" data-dialog-follow>关注这位伙伴</button></div></dialog>
    <div class="cn-toast" role="status" aria-live="polite" data-toast hidden></div>
    <script type="application/json" data-demo-json><?= Json::htmlEncode($demo) ?></script>
</div>
