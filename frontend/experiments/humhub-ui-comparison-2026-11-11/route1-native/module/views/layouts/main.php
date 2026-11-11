<?php
use humhub\assets\AppAsset;
use humhub\modules\comparisonNative\assets\NativeAsset;
use yii\helpers\Html;
AppAsset::register($this);
NativeAsset::register($this);
$this->title = '同频 CoLab · 原生主题验证';
?>
<?php $this->beginPage() ?>
<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="<?= Html::encode(Yii::$app->charset) ?>">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <?= Html::csrfMetaTags() ?>
    <title><?= Html::encode($this->title) ?></title>
    <?php $this->head() ?>
</head>
<body class="comparison-native">
<?php $this->beginBody() ?>
<?= $content ?>
<?php $this->endBody() ?>
</body>
</html>
<?php $this->endPage() ?>
