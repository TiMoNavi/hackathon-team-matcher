<?php
declare(strict_types=1);
use humhub\helpers\Html;
use humhub\widgets\modal\Modal;
use humhub\widgets\modal\ModalButton;
/** @var humhub\models\forms\CropProfileImage $model */
/** @var humhub\components\assets\AssetImage $assetImage */
$form = Modal::beginFormDialog([
    'title' => '裁剪头像',
    'footer' => ModalButton::cancel() . ' ' . ModalButton::save()->submit(),
    'id' => 'profile-image-crop-modal',
    'form' => ['id' => 'profile-image-crop-modal-form'],
]);
?>
<p>在图片上拖动选择范围，也可以用下方数字调整。保存后更新头像。</p>
<?= $form->errorSummary($model) ?>
<div id="matcher-avatar-crop-stage" style="position:relative;display:inline-block;max-width:100%;line-height:0">
    <?= Html::img($assetImage->getUrl([]), ['id' => 'crop-profile-image', 'alt' => '待裁剪头像', 'draggable' => 'false', 'style' => 'display:block;max-width:100%;max-height:450px;touch-action:none;user-select:none']) ?>
    <div id="matcher-avatar-crop-selection" aria-hidden="true" style="position:absolute;border:2px solid #0070c0;background:rgba(0,112,192,.12);pointer-events:none;box-sizing:border-box"></div>
</div>
<div class="row mt-2">
    <?php foreach (['cropX' => '横坐标', 'cropY' => '纵坐标', 'cropW' => '宽度', 'cropH' => '高度'] as $key => $label): ?>
        <div class="col-3"><?= $form->field($model, $key)->input('number', ['id' => $key, 'min' => in_array($key, ['cropW', 'cropH'], true) ? 1 : 0, 'step' => 1])->label($label) ?></div>
    <?php endforeach ?>
</div>
<?php
Modal::endFormDialog();
$this->registerJs(file_get_contents(dirname(__DIR__, 2) . '/adapters/media/native-avatar-crop.js'), yii\web\View::POS_READY, 'matcher-profile-avatar-crop');
