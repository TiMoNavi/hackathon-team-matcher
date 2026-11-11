<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\adapters\native;
use humhub\components\export\SpreadsheetExport;
use humhub\modules\calendar\widgets\ParticipantFilter;
use humhub\modules\user\models\User;
use Yii;
use yii\data\ActiveDataProvider;
use yii\web\BadRequestHttpException;
use yii\web\ForbiddenHttpException;

final class NativeCalendarEntryController extends \humhub\modules\calendar\controllers\EntryController
{
    public function actionExportParticipants(int $id, ?int $state, string $type)
    {
        $entry = $this->getCalendarEntry($id);
        if (!$entry->content->canEdit()) { throw new ForbiddenHttpException('You cannot export participants of this schedule.'); }
        if (!in_array($type, ['csv', 'xlsx'], true)) { throw new BadRequestHttpException('Unsupported export type.'); }
        $statuses = ParticipantFilter::getStatuses();
        $exporter = new SpreadsheetExport([
            'dataProvider' => new ActiveDataProvider(['query' => $entry->participation->findParticipants($state)]),
            'columns' => [
                ['label' => '昵称', 'value' => static fn(User $user): string => $user->displayName],
                ['label' => '参与状态', 'value' => static fn(User $user): string => $statuses[$entry->participation->getParticipationStatus($user)] ?? ''],
            ],
            'resultConfig' => ['fileBaseName' => 'Participants-' . $entry->title, 'writerType' => $type],
        ]);
        Yii::$app->response->headers->set('Cache-Control', 'private, no-store');
        return $exporter->export()->send();
    }
}
