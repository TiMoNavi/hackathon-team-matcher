<?php
declare(strict_types=1);
// Optional read-only adapter check against GitHub's public octocat account.
// No identity association, token, stored source, profile write, or OAuth claim.
// REST reference: https://docs.github.com/en/rest/users/users#get-a-user-using-their-id
$modules = dirname(__DIR__, 3);
spl_autoload_register(static function (string $class) use ($modules): void {
    foreach (['matcherProfile'=>'matcher-user-profile','matcherGithubImport'=>'matcher-github-import'] as $namespace=>$folder) {
        $prefix='humhub\\modules\\'.$namespace.'\\';
        if (str_starts_with($class,$prefix)) { $file=$modules.'/'.$folder.'/'.str_replace('\\','/',substr($class,strlen($prefix))).'.php'; if(is_file($file)){require $file;} }
    }
});
use humhub\modules\matcherGithubImport\adapters\http\CurlGithubApi;
use humhub\modules\matcherProfile\domain\ProfileException;
try {
    $api=new CurlGithubApi();$api->beginRead();$profile=$api->get('/user/583231');
    $checks=['public_numeric_id_endpoint'=>((string)($profile['id']??''))==='583231','public_personal_profile_shape'=>($profile['type']??'')==='User' && is_string($profile['login']??null)];
    if(in_array(false,$checks,true)){throw new RuntimeException('Public response contract mismatch');}
    echo json_encode(['status'=>'passed','checks'=>$checks,'api_version'=>CurlGithubApi::API_VERSION,'network_calls'=>1,'oauth_tested'=>false,'profile_data_persisted'=>false],JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES).PHP_EOL;
} catch(ProfileException $error) {
    echo json_encode(['status'=>'unavailable','reason'=>$error->errorCode,'oauth_tested'=>false,'profile_data_persisted'=>false],JSON_PRETTY_PRINT).PHP_EOL;exit(2);
}
