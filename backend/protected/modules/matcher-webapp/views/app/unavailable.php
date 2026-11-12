<?php
declare(strict_types=1);
use humhub\helpers\Html;
/** @var array $bootstrap */
?>
<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>活动应用暂不可用</title></head>
<body><main><h1>活动应用暂不可用</h1><p>页面资源尚未就绪，请稍后重试。</p><p><?= Html::a('原生首页', $bootstrap['native_home_url']) ?> · <?= Html::a('原生登录', $bootstrap['native_login_url']) ?></p></main></body></html>
