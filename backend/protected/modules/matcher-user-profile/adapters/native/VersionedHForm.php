<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\native;
use humhub\compat\HForm;
use yii\helpers\Html;

final class VersionedHForm extends HForm
{
    public function __construct(private HForm $delegate, private array $tokens) {}
    public function render($form)
    {
        $hidden = '';
        foreach ($this->tokens as $name => $value) { $hidden .= Html::hiddenInput($name, $value); }
        return $hidden . $this->delegate->render($form);
    }
}
