<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\adapters\persistence;
use humhub\modules\matcherProfile\domain\FieldCatalog;
use humhub\modules\matcherProfile\domain\ProfileScope;
use humhub\modules\matcherProfile\application\ProfileService;
use humhub\modules\matcherProfile\domain\ports\ProfileRepository;
use yii\db\Connection;
use yii\db\Query;

/** Existing native values become owner-only review drafts, never confirmed attributes. */
final class LegacyProfileImporter
{
    public function __construct(private Connection $db, private ProfileService $profiles, private ProfileRepository $repository) {}
    public function seed(int $ownerId): array
    {
        $scope = ProfileScope::global();
        $profile = $this->profiles->getProfile($ownerId, $ownerId, $scope);
        $state = $this->repository->findState($ownerId, $scope);
        if ($state !== null && (new Query())->from('{{%matcher_profile_draft}}')->where(['state_id' => $state['id'], 'origin' => 'migration'])->exists($this->db)) {
            return ['created' => false, 'candidate_count' => 0, 'invalid_candidate_count' => 0, 'deferred' => false];
        }
        $existing = array_column($profile['attributes'], 'key'); $operations = []; $invalid = 0;
        foreach ($this->repository->nativeCandidates($ownerId) as $key => $value) {
            if ($value === null || $value === '' || in_array($key, $existing, true) || $key === 'nickname') { continue; }
            if ($key === 'primary_portfolio_link') {
                if (in_array('portfolio_link', $existing, true)) { continue; }
                $key = 'portfolio_link'; $value = ['url' => $value, 'label' => '已有个人主页'];
            }
            if (!isset(FieldCatalog::definitions()[$key])) { continue; }
            if (FieldCatalog::validate($key, $value, false) !== []) { $invalid++; continue; }
            $operations[] = ['key' => $key, 'value' => $value, 'visibility' => 'private'];
        }
        if ($operations === []) { return ['created' => false, 'candidate_count' => 0, 'invalid_candidate_count' => $invalid, 'deferred' => false]; }
        if ($state !== null && (new Query())->from('{{%matcher_profile_draft}}')->where(['state_id' => $state['id'], 'draft_kind' => 'profile', 'status' => 'editing'])->exists($this->db)) {
            // Existing manual/onboarding edits stay the user's active work. The
            // same old values remain available as owner-only legacy_candidates.
            return ['created' => false, 'candidate_count' => 0, 'invalid_candidate_count' => $invalid, 'deferred' => true];
        }
        $draft = $this->profiles->startDraft($ownerId, $ownerId, $scope, 'migration', false);
        $this->profiles->updateDraft($ownerId, $ownerId, $scope, $draft['id'], $draft['draft_version'], $operations);
        return ['created' => true, 'candidate_count' => count($operations), 'invalid_candidate_count' => $invalid, 'deferred' => false];
    }
}
