<?php
declare(strict_types=1);
use humhub\helpers\Html;
use humhub\modules\matcherWebapp\application\Bootstrap;
/** @var array $bootstrap @var array $assets @var string $assetBase */
?>
<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>寻找活动队友</title>
<?php foreach ($assets['css'] as $css): ?>
    <?= Html::cssFile($assetBase . '/' . $css) ?>
<?php endforeach ?>
</head>
<body>
    <div id="matcher-webapp-root"><p>正在载入活动应用。</p><p><?= Html::a('原生首页', $bootstrap['native_home_url']) ?> · <?= Html::a('原生登录', $bootstrap['native_login_url']) ?></p></div>
    <noscript>此页面需要 JavaScript。<?= Html::a('打开原生首页', $bootstrap['native_home_url']) ?>或<?= Html::a('原生登录', $bootstrap['native_login_url']) ?>。</noscript>
    <script type="application/json" id="matcher-webapp-bootstrap" <?= Html::nonce() ?>><?= Bootstrap::json($bootstrap) ?></script>
    <?= Html::script('', ['type' => 'module', 'src' => $assetBase . '/' . $assets['entry']]) ?>
</body>
</html>
