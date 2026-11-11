<?php
declare(strict_types=1);
use humhub\modules\matcherProfile\assets\EditorAsset;
use yii\helpers\Html;
use yii\helpers\Json;
/** @var array $config */
EditorAsset::register($this);
$this->registerJs('window.MatcherProfileEditor && window.MatcherProfileEditor.boot();');
?>
<main id="matcher-profile-editor" class="matcher-profile-editor container" data-editor-config="<?= Html::encode(Json::encode($config)) ?>">
    <div class="panel panel-default">
        <div class="panel-heading"><h1>团队协作资料</h1></div>
        <div class="panel-body">
            <p>按自己的意愿补充资料。先保存草稿，再选择本次要确认的条目。</p>
            <p class="text-muted">性格、习惯、经历和联系方式长期保留；本次目标和投入按 Space 分别保存。</p>
            <div id="matcher-editor-status" role="status" aria-live="polite">正在读取资料…</div>
            <div id="matcher-editor-error" role="alert" hidden></div>
            <div class="matcher-editor-toolbar">
                <label for="matcher-profile-scope">编辑范围</label>
                <select id="matcher-profile-scope" class="form-control"><option value="global">全局个人资料</option></select>
                <button id="matcher-editor-reload" type="button" class="btn btn-default">重新读取</button>
            </div>
            <p id="matcher-editor-scope-help" class="text-muted"></p>
        </div>
    </div>
    <section id="matcher-editor-identity" class="panel panel-default" aria-labelledby="matcher-identity-heading">
        <div class="panel-heading"><h2 id="matcher-identity-heading">昵称与头像</h2></div>
        <div class="panel-body">
            <div class="matcher-identity-fields">
                <label for="matcher-nickname">昵称</label><input id="matcher-nickname" class="form-control" maxlength="32" autocomplete="nickname">
                <div><img id="matcher-avatar-preview" alt="当前或待确认头像" width="80" height="80" hidden></div>
                <label for="matcher-avatar-file">选择头像</label><input id="matcher-avatar-file" type="file" accept="image/png,image/jpeg,image/webp">
                <p class="text-muted">JPEG、PNG、WebP，最多 5 MiB。选择图片后，点击确认身份才会更换头像。</p>
                <div class="matcher-editor-actions"><button id="matcher-avatar-remove" type="button" class="btn btn-default">使用默认头像</button><button id="matcher-identity-save" type="button" class="btn btn-primary">确认昵称与头像</button></div>
            </div>
        </div>
    </section>
    <section id="matcher-editor-legacy" class="panel panel-default" hidden aria-labelledby="matcher-legacy-heading"><div class="panel-heading"><h2 id="matcher-legacy-heading">已有资料待核对</h2></div><div class="panel-body"><p>核对后可加入当前草稿，确认时再选择展示范围。</p><div id="matcher-legacy-items"></div></div></section>
    <div id="matcher-editor-fields" aria-label="资料字段"></div>
    <section class="panel panel-default matcher-editor-review" aria-labelledby="matcher-review-heading">
        <div class="panel-heading"><h2 id="matcher-review-heading">草稿与本次确认</h2></div>
        <div class="panel-body">
            <p id="matcher-editor-version"></p>
            <div class="matcher-editor-actions"><button id="matcher-draft-save" type="button" class="btn btn-primary">保存草稿</button><button id="matcher-draft-select-all" type="button" class="btn btn-default">选择全部待确认条目</button><button id="matcher-draft-confirm" type="button" class="btn btn-success">确认所选条目</button></div>
            <p class="text-muted">确认只保存勾选的变更。未勾选的条目继续留在草稿中。</p>
            <div id="matcher-pending-items"></div>
        </div>
    </section>
    <section class="panel panel-default" aria-labelledby="matcher-preview-heading">
        <div class="panel-heading"><h2 id="matcher-preview-heading">展示预览</h2></div>
        <div class="panel-body">
            <div class="matcher-editor-toolbar"><label for="matcher-preview-perspective">查看视角</label><select id="matcher-preview-perspective" class="form-control"><option value="owner">本人</option><option value="authenticated">其他登录用户</option><option value="friends">好友</option></select><button id="matcher-preview-refresh" type="button" class="btn btn-default">预览已保存内容</button></div>
            <p class="text-muted">预览由服务器按所选范围计算。有草稿时模拟确认后的效果；真实访问仍会验证对方资格。</p>
            <div id="matcher-preview-result" aria-live="polite"></div>
        </div>
    </section>
</main>
