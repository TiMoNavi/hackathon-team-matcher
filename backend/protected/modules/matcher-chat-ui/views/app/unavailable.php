<?php
declare(strict_types=1);
use humhub\helpers\Html;
/** @var array $bootstrap */
?>
<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>聊天页面暂不可用</title></head>
<body><main><h1>聊天页面暂不可用</h1>
<?php if (($entryState ?? '') === 'unsupported_coverage'): ?>
<p>当前仍有原生会话尚未被插件覆盖，暂不接管聊天列表。聊天记录保留，不会用部分列表替代全部会话。</p>
<?php elseif (($entryState ?? '') === 'paused'): ?>
<p>聊天入口接管已暂停或依赖尚未就绪。聊天记录保留，暂不自动切回旧聊天入口。</p>
<?php else: ?>
<p>页面资源尚未就绪，聊天功能仍在接入中。</p>
<?php endif ?>
<p><?= Html::a('原生首页', $bootstrap['native_home_url']) ?> · <?= Html::a('原生登录', $bootstrap['native_login_url']) ?></p></main></body></html>
