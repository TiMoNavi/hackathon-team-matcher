<?php
declare(strict_types=1);
$modules = dirname(__DIR__, 3);
spl_autoload_register(static function (string $class) use ($modules): void {
    foreach (['matcherProfile' => 'matcher-user-profile', 'matcherGithubImport' => 'matcher-github-import'] as $namespace => $folder) {
        $prefix = 'humhub\\modules\\' . $namespace . '\\';
        if (str_starts_with($class, $prefix)) { $file = $modules . '/' . $folder . '/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php'; if (is_file($file)) { require $file; } }
    }
});
use humhub\modules\matcherGithubImport\application\GithubSourceReader;
use humhub\modules\matcherGithubImport\adapters\http\CurlGithubApi;
use humhub\modules\matcherGithubImport\domain\ports\GithubIdentity;
use humhub\modules\matcherGithubImport\domain\ports\GithubApi;
use humhub\modules\matcherProfile\domain\FieldCatalog;
use humhub\modules\matcherProfile\domain\ProfileException;
$checks = [];
function check(string $name, bool $condition): void { global $checks; if (!$condition) { throw new RuntimeException($name); } $checks[] = $name; }
function denies(string $name, callable $callback, string $code): void { try { $callback(); } catch (ProfileException $error) { check($name, $error->errorCode === $code); return; } throw new RuntimeException($name . ': no denial'); }
final class MemoryIdentity implements GithubIdentity {
    public int $calls = 0;
    public array $info = ['available'=>true,'linked'=>true,'configured'=>true,'current_auth'=>true,'provider_user_id'=>'123','username'=>null,'canonical_url'=>null,'reason'=>null,'login_url'=>'/user/auth/external?authclient=github'];
    public ?array $after = null;
    public function status(int $ownerId): array { ++$this->calls; return $this->calls > 1 && $this->after !== null ? $this->after : $this->info; }
}
final class MemoryApi implements GithubApi {
    public array $calls = []; public int $starts = 0;
    public array $responses = [];
    public function beginRead(): void { ++$this->starts; }
    public function get(string $path, array $query = [], bool $optional = false): ?array {
        CurlGithubApi::assertRoute($path, $query); $this->calls[] = ['path'=>$path,'query'=>$query,'optional'=>$optional];
        if (!array_key_exists($path, $this->responses)) { if ($optional) { return null; } throw new RuntimeException('Unarranged API path: ' . $path); }
        $result = $this->responses[$path]; if ($result instanceof Throwable) { throw $result; } return $result;
    }
}
function fixture(): object {
    $e = new stdClass(); $e->identity = new MemoryIdentity(); $e->api = new MemoryApi();
    $e->api->responses = [
        '/user/123' => ['id'=>123,'login'=>'synthetic-owner','type'=>'User','name'=>'合成公开名称','bio'=>'开发协作工具','location'=>'北京','blog'=>'example.org','email'=>'synthetic@example.org','company'=>'合成组织','followers'=>999999,'avatar_url'=>'http://127.0.0.1/private','access_token'=>'must-not-copy'],
        '/users/synthetic-owner/repos' => [repository()],
        '/repos/synthetic-owner/project-one/readme' => ['encoding'=>'base64','content'=>base64_encode('# 合成项目' . chr(10) . '可审阅项目说明。')],
    ];
    $e->reader = new GithubSourceReader($e->identity,$e->api);return $e;
}
function repository(array $extra = []): array { return array_replace(['id'=>1001,'name'=>'project-one','private'=>false,'visibility'=>'public','fork'=>false,'owner'=>['id'=>123],'language'=>'PHP','description'=>'用于合成测试的项目','topics'=>['teamwork'],'html_url'=>'http://127.0.0.1/forged','stargazers_count'=>999999],$extra); }
function candidate(array $result,string $id): ?array { foreach($result['candidates'] as $item){if($item['id']===$id)return $item;}return null; }

$e = fixture();$status = $e->reader->status(1);
check('local_status_reports_verified_link_without_network', $status['kind']==='github' && $status['linked'] && $e->api->calls===[]);
check('status_does_not_assume_native_username_is_github_login', $status['username']===null && $status['canonical_url']===null);
denies('anonymous_reader_rejected',fn()=>$e->reader->read(0,[]),'AUTHENTICATION_REQUIRED');
denies('username_injection_rejected',fn()=>$e->reader->read(1,['username'=>'someone-else']),'GITHUB_INPUT_NOT_ALLOWED');
denies('url_injection_rejected',fn()=>$e->reader->read(1,['url'=>'http://127.0.0.1']),'GITHUB_INPUT_NOT_ALLOWED');
check('bad_inputs_never_start_network',$e->api->calls===[]);
$r=$e->reader->read(1,[]);
check('stable_verified_id_drives_first_request',$e->api->calls[0]['path']==='/user/123');
check('current_login_builds_public_profile_url',$r['canonical_url']==='https://github.com/synthetic-owner');
check('source_external_key_is_stable_id',$r['external_id']==='github:123');
check('repository_query_bounded_and_ordered_by_name',$e->api->calls[1]['query']===['per_page'=>10,'type'=>'owner','sort'=>'full_name','direction'=>'asc']);
check('readme_uses_fixed_account_and_repository_path',$e->api->calls[2]['path']==='/repos/synthetic-owner/project-one/readme');
check('structured_sections_preserve_chinese_text',str_contains($r['raw_text'],'可审阅项目说明。') && count($r['sections'])===9);
check('section_locators_use_common_structured_contract',count(array_filter($r['sections'],fn($s)=>is_array($s['locator']) && is_string($s['locator']['path']??null)))===count($r['sections']));
check('rules_mode_uses_zero_model_calls',$r['metadata']['generation_mode']==='rules' && $r['metadata']['llm_calls']===0);
check('public_bio_and_location_are_candidates',candidate($r,'github-bio')['value']==='开发协作工具' && candidate($r,'github-city')['value']==='北京');
check('explicit_public_contact_is_optional_candidate',candidate($r,'github-email')['value']==='synthetic@example.org');
check('website_without_scheme_is_normalized',candidate($r,'github-website')['value']['url']==='https://example.org');
check('repository_url_is_constructed_not_trusted',candidate($r,'github-project-1001')['value']['links']===['https://github.com/synthetic-owner/project-one']);
check('repository_tech_preserves_declared_language',candidate($r,'github-project-1001')['value']['tech_codes']===['PHP']);
check('repository_does_not_assert_personal_contribution',!isset(candidate($r,'github-project-1001')['value']['contribution']));
check('display_name_does_not_claim_real_name',!in_array('real_name',array_column($r['candidates'],'key'),true));
check('no_skill_or_character_inferred_from_repository',!array_intersect(['skill','personality','role'],array_column($r['candidates'],'key')));
check('private_or_irrelevant_response_keys_not_copied',!str_contains(json_encode($r),'must-not-copy') && !str_contains($r['raw_text'],'999999') && !str_contains($r['raw_text'],'127.0.0.1'));
$ids=array_column($r['sections'],'id');
check('all_candidates_link_existing_evidence',count(array_filter($r['candidates'],fn($c)=>$c['evidence']!==[] && array_diff($c['evidence'],$ids)===[]))===count($r['candidates']));
check('all_candidates_validate_as_global_fields',count(array_filter($r['candidates'],fn($c)=>FieldCatalog::get($c['key'])['scope']==='global' && FieldCatalog::validate($c['key'],$c['value'])===[]))===count($r['candidates']));
check('candidate_ids_and_sections_are_unique',count(array_unique(array_column($r['candidates'],'id')))===count($r['candidates']) && count(array_unique($ids))===count($ids));
check('identity_rechecked_after_network',$e->identity->calls===3);
$e=fixture();$e->identity->info['linked']=false;$e->identity->info['available']=false;$e->identity->info['reason']='GITHUB_NOT_LINKED';
denies('unlinked_account_cannot_import',fn()=>$e->reader->read(1,[]),'GITHUB_NOT_LINKED');check('unlinked_account_no_network',$e->api->calls===[]);
$e=fixture();$e->identity->info['current_auth']=false;$r=$e->reader->read(1,[]);check('verified_link_survives_other_login_method',$r['external_id']==='github:123');
$e=fixture();$e->identity->after=$e->identity->info;$e->identity->after['provider_user_id']='456';denies('relinked_during_read_rejected',fn()=>$e->reader->read(1,[]),'GITHUB_IDENTITY_CHANGED');
$e=fixture();$e->api->responses['/user/123']['id']=456;denies('upstream_wrong_account_rejected',fn()=>$e->reader->read(1,[]),'GITHUB_IDENTITY_MISMATCH');check('mismatch_stops_before_repositories',count($e->api->calls)===1);
$e=fixture();$e->api->responses['/user/123']['type']='Organization';denies('organization_not_personal_identity',fn()=>$e->reader->read(1,[]),'GITHUB_IDENTITY_MISMATCH');
$e=fixture();$e->api->responses['/user/123']['login']='../internal';denies('malformed_upstream_username_rejected',fn()=>$e->reader->read(1,[]),'GITHUB_IDENTITY_MISMATCH');
$e=fixture();$e->api->responses['/users/synthetic-owner/repos']=[repository(['id'=>1,'private'=>true]),repository(['id'=>2,'fork'=>true]),repository(['id'=>3,'owner'=>['id'=>456]]),repository(['id'=>4,'name'=>'../escape']),repository()];$r=$e->reader->read(1,[]);
check('private_fork_foreign_and_invalid_repos_excluded',$r['metadata']['repository_count']===1 && count($e->api->calls)===4);
$e=fixture();$e->api->responses['/users/synthetic-owner/repos']=array_map(fn($i)=>repository(['id'=>1000+$i,'name'=>'project-'.$i]),range(1,20));$r=$e->reader->read(1,[]);
check('upstream_overlong_list_is_capped_at_ten',$r['metadata']['repository_count']===10 && count($e->api->calls)===13);
$e=fixture();$r=$e->reader->read(1,[]);check('missing_personal_readme_is_normal',$r['metadata']['profile_readme_present']===false && $r['metadata']['warnings']===[]);
$e=fixture();$e->api->responses['/repos/synthetic-owner/synthetic-owner/readme']=['encoding'=>'base64','content'=>base64_encode('Personal profile README outside selected repos')];$r=$e->reader->read(1,[]);
check('personal_readme_is_read_even_outside_selected_repositories',$r['metadata']['profile_readme_present'] && str_contains($r['raw_text'],'Personal profile README outside selected repos'));
check('personal_readme_is_source_text_not_automatic_bio',candidate($r,'github-bio')['value']==='开发协作工具' && count(array_filter($r['sections'],fn($s)=>$s['id']==='github-profile-readme'))===1);
$e=fixture();$e->api->responses['/users/synthetic-owner/repos']=[repository(['name'=>'synthetic-owner'])];$e->api->responses['/repos/synthetic-owner/synthetic-owner/readme']=['encoding'=>'base64','content'=>base64_encode('Personal profile README once')];$r=$e->reader->read(1,[]);
check('selected_personal_readme_is_not_requested_or_stored_twice',count($e->api->calls)===3 && substr_count($r['raw_text'],'Personal profile README once')===1 && $r['metadata']['profile_readme_present']);
$e=fixture();$e->api->responses['/repos/synthetic-owner/project-one/readme']=null;$r=$e->reader->read(1,[]);check('missing_readme_keeps_public_project',$r['metadata']['readme_count']===0 && candidate($r,'github-project-1001')!==null);
$e=fixture();$e->api->responses['/repos/synthetic-owner/project-one/readme']['content']='%%%';$r=$e->reader->read(1,[]);check('invalid_readme_is_reported_without_losing_profile',$r['metadata']['warnings'][0]['code']==='GITHUB_README_NOT_TEXT' && candidate($r,'github-bio')!==null);
$e=fixture();$e->api->responses['/repos/synthetic-owner/project-one/readme']['content']=base64_encode(str_repeat('中文',10000));$r=$e->reader->read(1,[]);$last=$r['sections'][count($r['sections'])-1];
check('long_readme_capped_without_broken_utf8',strlen($last['text'])<=24576 && mb_check_encoding($last['text'],'UTF-8') && $r['metadata']['warnings'][0]['code']==='GITHUB_README_TRUNCATED');
$e=fixture();$e->api->responses['/users/synthetic-owner/repos']=new ProfileException('GITHUB_RATE_LIMITED','private diagnostic must not leak',503);$r=$e->reader->read(1,[]);
check('repository_failure_preserves_profile_and_safe_warning',candidate($r,'github-bio')!==null && $r['metadata']['warnings'][0]['code']==='GITHUB_RATE_LIMITED' && !str_contains(json_encode($r),'private diagnostic'));
$e=fixture();$e->api->responses['/user/123']=new ProfileException('GITHUB_NETWORK_UNAVAILABLE','Cannot reach public provider',503);denies('initial_network_failure_is_explicit',fn()=>$e->reader->read(1,[]),'GITHUB_NETWORK_UNAVAILABLE');
$e=fixture();$e->api->responses['/user/123']['blog']='javascript:alert(1)';$e->api->responses['/user/123']['email']='invalid email';$r=$e->reader->read(1,[]);check('invalid_link_and_email_not_candidates',candidate($r,'github-website')===null && candidate($r,'github-email')===null);
$e=fixture();$e->api->responses['/user/123']['blog']='https://name:password@example.org';$r=$e->reader->read(1,[]);check('credentialed_link_not_candidate',candidate($r,'github-website')===null);
foreach (['https://evil.example/user/123','//evil.example/user/123','/user/0','/user/123?target=1','/repos/name/../readme','/repos/name/a%2Fb/readme','/repos/name/project/readme/extra','/users/name/repos/'] as $index=>$path) { denies('unapproved_route_'.$index,fn()=>CurlGithubApi::assertRoute($path,[]),'GITHUB_INVALID_ROUTE'); }
denies('unbounded_page_query_rejected',fn()=>CurlGithubApi::assertRoute('/users/name/repos',['per_page'=>100,'type'=>'owner','sort'=>'full_name','direction'=>'asc']),'GITHUB_INVALID_ROUTE');
denies('extra_query_rejected',fn()=>CurlGithubApi::assertRoute('/user/123',['url'=>'http://127.0.0.1']),'GITHUB_INVALID_ROUTE');
$api=new CurlGithubApi();$api->beginRead();$rp=new ReflectionProperty($api,'requests');$rp->setValue($api,13);denies('request_budget_checked_before_network',fn()=>$api->get('/user/123'),'GITHUB_READ_BUDGET_EXCEEDED');
$api=new CurlGithubApi();$api->beginRead();(new ReflectionProperty($api,'started'))->setValue($api,microtime(true)-36);denies('elapsed_budget_checked_before_network',fn()=>$api->get('/user/123'),'GITHUB_READ_BUDGET_EXCEEDED');
$manifest=json_decode(file_get_contents(dirname(__DIR__,2).'/module.json'),true);
check('plugin_declares_both_required_dependencies',isset($manifest['humhub']['modules']['matcher-user-profile'],$manifest['humhub']['modules']['auth-github']));
echo json_encode(['status'=>'passed','passed'=>count($checks),'checks'=>$checks,'database_calls'=>0,'network_calls'=>0,'llm_calls'=>0],JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE).PHP_EOL;
