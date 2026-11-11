<?php
namespace humhub\modules\comparisonNative;

class Module extends \humhub\components\Module
{
    public function init()
    {
        parent::init();
        \Yii::setAlias('@comparisonNative', $this->getBasePath());
    }
}
