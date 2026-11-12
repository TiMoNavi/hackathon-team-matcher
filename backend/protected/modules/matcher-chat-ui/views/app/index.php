<?php
declare(strict_types=1);
use humhub\helpers\Html;
use humhub\modules\matcherChatUi\application\Bootstrap;
use humhub\modules\matcherChatUi\application\ReadBootstrap;
/** @var array $bootstrap @var array $assets @var string $assetBase */
$reading = $bootstrap['schema_version'] === 2;
?>
<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= $reading ? '对话' : '对话与群聊 · 接入中' ?></title>
<?php foreach ($assets['css'] as $css): ?>
    <?= Html::cssFile($assetBase . '/' . $css) ?>
<?php endforeach ?>
</head>
<body>
    <div id="matcher-chat-root"><p><?= $reading ? '正在初始化聊天页面。' : '聊天接入中，尚未读取会话。' ?></p><p><?= Html::a('原生首页', $bootstrap['native_home_url']) ?> · <?= Html::a('原生登录', $bootstrap['native_login_url']) ?></p></div>
    <noscript>此页面需要 JavaScript。<?= Html::a('打开原生首页', $bootstrap['native_home_url']) ?>或<?= Html::a('原生登录', $bootstrap['native_login_url']) ?>。</noscript>
    <script type="application/json" id="matcher-chat-bootstrap" <?= Html::nonce() ?>><?= $reading ? ReadBootstrap::json($bootstrap) : Bootstrap::json($bootstrap) ?></script>
    <?= Html::script('', ['type' => 'module', 'src' => $assetBase . '/' . $assets['entry']]) ?>
</body>
</html>
