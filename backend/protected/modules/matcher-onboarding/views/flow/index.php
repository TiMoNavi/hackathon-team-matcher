<?php
declare(strict_types=1);
use humhub\modules\matcherOnboarding\assets\FlowAsset;
use yii\helpers\Html;
use yii\helpers\Json;
/** @var array $config */
FlowAsset::register($this);
$this->registerJs('window.MatcherOnboarding && window.MatcherOnboarding.boot();');
?>
<main id="matcher-onboarding" class="matcher-onboarding container" aria-busy="true" data-stage="materials" data-flow-config="<?= Html::encode(Json::encode($config)) ?>">
    <header class="onboarding-header">
        <div><span class="onboarding-eyebrow">认识彼此，从一点点开始</span><h1>让未来的队友认识你</h1><p>先看看已有资料，再回答几个与你合作有关的问题。每一项都由你决定。</p></div>
        <a class="btn btn-default" href="<?= Html::encode(\yii\helpers\Url::to(['/matcher-user-profile/editor/index'])) ?>">普通资料编辑</a>
    </header>
    <section class="onboarding-context" aria-label="当前填写范围">
        <label for="onboarding-space">这次为哪个 Space 填写？</label>
        <select id="onboarding-space" class="form-control"><option value="global">先整理全局个人资料</option></select>
        <button type="button" id="onboarding-start" class="btn btn-primary">开始 / 继续填写</button>
        <p>长期习惯和经历随你保留；本次目标与投入单独保存在所选 Space。</p>
    </section>
    <nav id="onboarding-steps" class="onboarding-steps" aria-label="填写进度">
        <button type="button" data-step="materials"><span>1</span>提供资料</button>
        <button type="button" data-step="review"><span>2</span>核对信息</button>
        <button type="button" data-step="questions"><span>3</span>几个补问</button>
        <button type="button" data-step="draft"><span>4</span>编辑画像</button>
        <button type="button" data-step="privacy"><span>5</span>范围与确认</button>
    </nav>
    <div class="onboarding-feedback"><p id="onboarding-status" role="status" aria-live="polite">正在读取填写范围…</p><p id="onboarding-error" role="alert" hidden></p></div>
    <div id="onboarding-conflict-actions" class="onboarding-actions" hidden>
        <button id="onboarding-reconcile" class="btn btn-default" type="button">重新核对最新资料</button>
        <button id="onboarding-reload" class="btn btn-default" type="button">重新读取已保存进度</button>
    </div>
    <div id="onboarding-workspace" hidden>
        <section data-stage-panel="materials" class="onboarding-panel">
            <h2>先从你已有的信息开始</h2><p>从 GitHub 或简历整理资料，再核对想展示的内容。也可以手动补充或直接继续。</p>
            <section id="onboarding-sources" class="onboarding-sources" aria-label="导入已有资料" hidden></section>
            <div id="onboarding-existing-summary" class="onboarding-note"></div>
            <label for="onboarding-headline">用一句话介绍自己 <small>可选</small></label>
            <input id="onboarding-headline" class="form-control" maxlength="160" placeholder="例如：喜欢把新想法做成可用产品的后端开发者">
            <label for="onboarding-bio">你想让队友了解什么？ <small>可选</small></label>
            <textarea id="onboarding-bio" class="form-control" maxlength="10000" rows="6" placeholder="可以说说做过的项目、擅长的事，或你对一起做项目的期待。"></textarea>
            <div class="onboarding-actions"><button id="onboarding-materials-save" class="btn btn-default" type="button">保存草稿</button><button id="onboarding-materials-next" class="btn btn-primary" type="button">继续核对</button></div>
        </section>
        <section data-stage-panel="review" class="onboarding-panel" hidden>
            <h2>目前了解到的你</h2><p>先核对这些内容。修改会留在草稿；点击确认后才成为普通个人资料。每条都可调整展示范围。</p>
            <div id="onboarding-review-fields"></div>
            <div class="onboarding-actions"><button id="onboarding-review-save" class="btn btn-default" type="button">保存修改</button><button id="onboarding-review-confirm" class="btn btn-primary" type="button">这些信息正确，继续</button></div>
        </section>
        <section data-stage-panel="questions" class="onboarding-panel" hidden>
            <div class="onboarding-question-top"><p id="onboarding-question-progress"></p><span class="onboarding-mode">基础规则整理</span></div>
            <h2 id="onboarding-question-title">再了解一点你的合作方式</h2><p id="onboarding-question-reason"></p>
            <div id="onboarding-question-body"></div>
            <div class="onboarding-actions"><button id="onboarding-question-previous" class="btn btn-default" type="button">上一题</button><button id="onboarding-question-skip" class="btn btn-default" type="button">暂时说不准</button><button id="onboarding-question-next" class="btn btn-primary" type="button">保存并继续</button></div>
            <button id="onboarding-synthesize" class="btn btn-primary" type="button" hidden>整理我的画像</button>
        </section>
        <section data-stage-panel="draft" class="onboarding-panel" hidden>
            <h2>这是你的画像草稿</h2><p>已有资料和你的回答已整理到一起。你可以修改文字、增删记录，再预览给别人看的样子。</p>
            <div id="onboarding-card-summary" class="onboarding-note"></div>
            <div id="onboarding-draft-fields"></div>
            <div class="onboarding-actions"><button id="onboarding-draft-save" class="btn btn-default" type="button">保存草稿</button><button id="onboarding-draft-next" class="btn btn-primary" type="button">预览展示范围</button></div>
        </section>
        <section data-stage-panel="privacy" class="onboarding-panel" hidden>
            <h2>确认你想展示的内容</h2><p>新增确认条目默认向通过合法入口访问的登录用户展示。你可以逐条选择好友可见或仅自己可见。</p>
            <div id="onboarding-privacy-fields"></div>
            <div class="onboarding-preview-toolbar"><label for="onboarding-preview-perspective">预览视角</label><select id="onboarding-preview-perspective" class="form-control"><option value="owner">本人</option><option value="authenticated">其他登录用户</option><option value="friends">好友</option></select><button id="onboarding-preview-refresh" class="btn btn-default" type="button">保存并预览</button></div>
            <div id="onboarding-preview" class="onboarding-preview" aria-live="polite"></div>
            <div class="onboarding-actions"><button id="onboarding-complete" class="btn btn-primary" type="button">保存我的资料</button></div>
        </section>
        <section data-stage-panel="completed" class="onboarding-panel" hidden>
            <span class="onboarding-done" aria-hidden="true">✓</span><h2>你的资料已保存</h2><p>以后可以随时修改。全局资料和本次 Space 偏好已分别保存到普通个人资料。</p>
            <div id="onboarding-completed-summary"></div>
            <div class="onboarding-actions"><a id="onboarding-open-profile" class="btn btn-primary" href="<?= Html::encode(\yii\helpers\Url::to(['/matcher-user-profile/editor/index'])) ?>">查看普通个人资料</a><button id="onboarding-restart" class="btn btn-default" type="button">重新整理</button></div>
        </section>
        <footer class="onboarding-footer"><span id="onboarding-version"></span><button id="onboarding-save-exit" class="btn btn-default" type="button">保存并退出</button></footer>
    </div>
</main>
