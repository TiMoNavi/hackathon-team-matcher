<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\adapters\native;
use yii\helpers\Html;

final class NativePeopleTags extends \humhub\modules\user\widgets\PeopleTagList
{
    public function run()
    {
        $tags = [];
        foreach (NativeProfilePresenter::attributes((int)$this->user->id, 'summary') as $attribute) {
            if (in_array($attribute['key'], ['interest', 'direction'], true)) { $tags[] = '<span class="badge text-bg-light">' . Html::encode(NativeProfilePresenter::value($attribute['value'])) . '</span>'; }
            if (count($tags) >= $this->maxTags) { break; }
        }
        return str_replace('{tags}', implode(' ', $tags), $this->template);
    }
}
