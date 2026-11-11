<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\assets;

/** Only local assets; the editor does not require an external UI or model service. */
final class EditorAsset extends \yii\web\AssetBundle
{
    public $sourcePath = '@matcherProfile/assets/editor';
    public $css = ['editor.css'];
    public $js = ['editor.js'];
    public $depends = [\humhub\assets\AppAsset::class];
}
