<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\adapters\native;
use yii\helpers\Html;

final class NativePeopleDetails extends \humhub\modules\user\widgets\PeopleDetails
{
    public function run()
    {
        $parts = [];
        foreach (NativeProfilePresenter::attributes((int)$this->user->id, 'summary') as $attribute) {
            if (in_array($attribute['key'], ['headline', 'city', 'role'], true)) { $parts[] = Html::encode(NativeProfilePresenter::value($attribute['value'])); }
        }
        return str_replace('{lines}', implode($this->separator, $parts), $this->template);
    }
}
