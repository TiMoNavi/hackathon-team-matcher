<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\adapters\persistence;
use Yii;
use yii\db\Connection;
use yii\db\Query;

final class PrivacySchemaInstaller
{
    public function __construct(private Connection $db) {}
    public function install(): array
    {
        $module = Yii::$app->getModule('matcher-profile-privacy');
        $fields = (new Query())->select(['id', 'internal_name', 'visible', 'searchable', 'directory_filter'])->from('{{%profile_field}}')->all($this->db);
        if (!$module->settings->get('originalProfileFieldFlags')) {
            $module->settings->set('originalProfileFieldFlags', json_encode($fields, JSON_THROW_ON_ERROR));
            $module->settings->set('originalDisplayNameFormat', (string)Yii::$app->settings->get('displayNameFormat', ''));
        }
        // Old generic renderers have no per-viewer policy. Confirmed values are
        // rendered by explicit projections, while ordinary edit forms remain usable.
        $this->db->createCommand()->update('{{%profile_field}}', ['visible' => 0, 'searchable' => 0, 'directory_filter' => 0])->execute();
        Yii::$app->settings->set('displayNameFormat', '{profile.matcher_nickname}');
        $profile = Yii::$app->getModule('matcher-user-profile');
        $importer = new LegacyProfileImporter($this->db, $profile->getProfileService(), $profile->getProfileRepository());
        $report = ['native_fields_protected' => count($fields), 'review_drafts_created' => 0, 'candidate_count' => 0, 'invalid_candidate_count' => 0, 'review_drafts_deferred' => 0];
        foreach ((new Query())->select('id')->from('{{%user}}')->where(['status' => 1])->column($this->db) as $ownerId) {
            $result = $importer->seed((int)$ownerId);
            $report['review_drafts_created'] += (int)$result['created'];
            $report['candidate_count'] += $result['candidate_count'];
            $report['invalid_candidate_count'] += $result['invalid_candidate_count'];
            $report['review_drafts_deferred'] += (int)$result['deferred'];
        }
        Yii::$app->cache->flush();
        return $report;
    }
}
