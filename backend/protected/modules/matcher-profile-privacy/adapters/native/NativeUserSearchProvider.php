<?php
declare(strict_types=1);
namespace humhub\modules\matcherPrivacy\adapters\native;
use humhub\services\MetaSearchService;

final class NativeUserSearchProvider extends \humhub\modules\user\search\UserSearchProvider
{
    private ?MetaSearchService $privacySearchService = null;
    public function getRoute(): string|array { return ['/user/people', 'space_id' => NativeRequestContext::spaceId()]; }
    public function getResults(int $maxResults): array
    {
        $query = new ScopedPeopleQuery(['pageSize' => min(48, max(1, $maxResults)), 'defaultFilters' => ['keyword' => $this->getKeyword()]]);
        $results = [];
        foreach ($query->all() as $user) { $results[] = new NativeSearchRecord($user, $query->verifiedSpaceId); }
        return ['totalCount' => $query->pagination->totalCount, 'results' => $results];
    }
    public function getService(): MetaSearchService { return $this->privacySearchService ??= new UncachedProfileMetaSearch($this); }
}

final class UncachedProfileMetaSearch extends MetaSearchService
{
    public function search(): void
    {
        if ($this->provider === null || $this->provider->getKeyword() === null) { return; }
        $data = $this->provider->getResults($this->pageSize);
        $this->totalCount = $data['totalCount']; $this->results = $data['results'];
    }
}

final class NativeSearchRecord extends \humhub\modules\user\search\SearchRecord
{
    public function __construct(\humhub\modules\user\models\User $user, private ?int $spaceId) { parent::__construct($user); }
    public function getDescription(): string { return NativeProfilePresenter::subTitle($this->user); }
    public function getUrl(): string { return $this->user->createUrl('/user/profile/about', ['space_id' => $this->spaceId]); }
}
