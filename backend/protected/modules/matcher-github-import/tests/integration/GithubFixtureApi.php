<?php
declare(strict_types=1);
namespace humhub\modules\matcherGithubImport\tests\integration;
use humhub\modules\matcherGithubImport\domain\ports\GithubApi;
use humhub\modules\matcherGithubImport\adapters\http\CurlGithubApi;
/** Fixed synthetic server transport. Used only by the isolated S5 test router. */
final class GithubFixtureApi implements GithubApi
{
    public function __construct(private int $ownerId, private string $runtime) {}
    public function beginRead(): void {}
    public function get(string $path, array $query = [], bool $optional = false): ?array
    {
        CurlGithubApi::assertRoute($path,$query);
        $id=910000000+$this->ownerId;$login='s5-github-'.$this->ownerId;
        file_put_contents($this->runtime.'/github-fixture-requests.jsonl',json_encode(['owner_id'=>$this->ownerId,'path'=>$path]).PHP_EOL,FILE_APPEND|LOCK_EX);
        if($path==='/user/'.$id){return ['id'=>$id,'login'=>$login,'type'=>'User','bio'=>'S5 GitHub 合成简介','location'=>'杭州','blog'=>'https://example.org/s5-public-work'];}
        if($path==='/users/'.$login.'/repos'){return [['id'=>920000000+$this->ownerId,'name'=>'collaboration-sample','private'=>false,'visibility'=>'public','fork'=>false,'owner'=>['id'=>$id],'language'=>'TypeScript','description'=>'S5 合成公开项目','topics'=>['collaboration']]];}
        if($path==='/repos/'.$login.'/collaboration-sample/readme'){return ['encoding'=>'base64','content'=>base64_encode('# 合成 README'.PHP_EOL.'PRIVATE_GITHUB_README_MARKER_'.$this->ownerId)];}
        if($path==='/repos/'.$login.'/'.$login.'/readme'){return ['encoding'=>'base64','content'=>base64_encode('# 合成个人主页'.PHP_EOL.'PRIVATE_PROFILE_README_MARKER_'.$this->ownerId)];}
        throw new \RuntimeException('Unexpected synthetic GitHub path.');
    }
}
