<?php
namespace humhub\modules\comparisonNative\assets;

/** Native route deliberately includes HumHub, Bootstrap, jQuery and PJAX assets. */
class NativeAsset extends \yii\web\AssetBundle
{
    public $sourcePath = '@comparisonNative/resources';
    public $css = ['css/native-home.css'];
    public $js = ['js/native-home.js'];
    public $depends = [\humhub\assets\AppAsset::class];
}
