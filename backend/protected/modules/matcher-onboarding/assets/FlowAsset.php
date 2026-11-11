<?php
declare(strict_types=1);
namespace humhub\modules\matcherOnboarding\assets;

final class FlowAsset extends \yii\web\AssetBundle
{
    public $sourcePath = '@matcherOnboarding/assets/flow';
    public $css = ['flow.css'];
    public $js = ['sources.js', 'flow.js'];
    public $depends = [\humhub\assets\AppAsset::class];
}
