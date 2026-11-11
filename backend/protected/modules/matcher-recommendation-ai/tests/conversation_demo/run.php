<?php
declare(strict_types=1);
// Manual real-gateway acceptance with a fixed invented corpus. No HumHub bootstrap or existing DB.
ini_set('display_errors','0');ini_set('zend.exception_ignore_args','1');
$workspaceRoot=dirname(__DIR__,6);$modulesPath=$workspaceRoot.'/backend/protected/modules';
require_once $modulesPath.'/matcher-recommendation/tests/support/autoload.php';
require_once $modulesPath.'/matcher-recommendation/tests/ai_runs/Fixtures.php';
require_once $modulesPath.'/matcher-recommendation/tests/conversation_integration/Fixtures.php';
spl_autoload_register(static function(string $class)use($modulesPath):void{
    $prefix='humhub\\modules\\matcherRecommendationAi\\';if(str_starts_with($class,$prefix)){$file=$modulesPath.'/matcher-recommendation-ai/'.str_replace('\\','/',substr($class,strlen($prefix))).'.php';if(is_file($file)){require_once $file;}}
});
use humhub\modules\matcherRecommendation\application\conversation\ConversationService;
use humhub\modules\matcherRecommendation\adapters\conversation\{PdoConversationStore,ConversationStorageSchema};
use humhub\modules\matcherRecommendation\adapters\time\SystemClock;
use humhub\modules\matcherRecommendation\contracts\QueryIntent;
use humhub\modules\matcherRecommendation\domain\conversation\ConversationLimits;
use humhub\modules\matcherRecommendation\tests\conversation_integration\{Fixtures as F,CorpusRetriever};
use humhub\modules\matcherRecommendation\tests\rules\Fixtures as R;
use humhub\modules\matcherRecommendationAi\adapters\gateway\{GatewayConfig,GatewayTransport,GatewayResponse,CurlGatewayTransport,ChatCompletionsClient};
use humhub\modules\matcherRecommendationAi\adapters\conversation\ChatConversationProvider;

final class ConversationJournal
{
    public array $data;public string $turn='';
    public function __construct(public readonly string $path,string $hash){$this->data=['date'=>'2026-11-12','status'=>'running','synthetic_only'=>true,'existing_database_connected'=>false,'real_accounts_created'=>false,'corpus_sha256'=>$hash,'generation_requests_cap'=>16,'requests'=>[],'turns'=>[],'recording_policy'=>'Only fixed synthetic requests and visible assistant content, no headers, credentials, reasoning_content or real profiles. Simulated user messages are test inputs, not real participant conversation.'];$this->save();}
    public function save():void{file_put_contents($this->path.'.tmp',json_encode($this->data,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR).PHP_EOL);rename($this->path.'.tmp',$this->path);}
}
final class RecordedConversationTransport implements GatewayTransport
{
    public function __construct(private readonly ConversationJournal $journal){}
    public function post(#[\SensitiveParameter]GatewayConfig $config,#[\SensitiveParameter]string $requestJson):GatewayResponse
    {
        if(count($this->journal->data['requests'])>=$this->journal->data['generation_requests_cap']){throw new RuntimeException('Synthetic call cap reached.');}
        $row=['number'=>count($this->journal->data['requests'])+1,'turn'=>$this->journal->turn,'request_bytes'=>strlen($requestJson),'request'=>json_decode($requestJson,true,64,JSON_THROW_ON_ERROR)];$start=hrtime(true);
        try{$response=(new CurlGatewayTransport(timeoutSeconds:60))->post($config,$requestJson);$body=json_decode($response->body(),true);$choice=$body['choices'][0]??[];
            $row['http_status']=$response->status;$row['response_bytes']=strlen($response->body());$row['response_model']=is_string($body['model']??null)?$body['model']:null;$row['finish_reason']=$choice['finish_reason']??null;
            $row['assistant_content']=is_string($choice['message']['content']??null)?$choice['message']['content']:null;
            $row['usage']=[];foreach(['prompt_tokens','completion_tokens','total_tokens']as$key){if(is_int($body['usage'][$key]??null)){$row['usage'][$key]=$body['usage'][$key];}}
            return $response;
        }finally{$row['elapsed_ms']=round((hrtime(true)-$start)/1e6,3);$this->journal->data['requests'][]=$row;$this->journal->save();echo json_encode(['recorded_request'=>$row['number'],'turn'=>$row['turn'],'http_status'=>$row['http_status']??null],JSON_UNESCAPED_UNICODE).PHP_EOL;flush();}
    }
}
function confirmedProjectRequirements():QueryIntent{return new QueryIntent('person',[
    R::condition('needs','supply_demand',['后端开发'],'hard'),
    R::condition('availability','interval_overlap',[['starts_at'=>'2026-11-14T14:00:00+08:00','ends_at'=>'2026-11-14T18:00:00+08:00']],'hard')]);}
$journal=null;$dbPath=null;
try{
    if(($argv[1]??'')!=='--allow-network'){throw new RuntimeException('Explicit synthetic network mode required.');}
    $corpusPath=$workspaceRoot.'/docs/推荐模块/examples/conversation-project-corpus_2026-11-12.json';$corpusHash=hash_file('sha256',$corpusPath);
    if($corpusHash!=='19c2b3e628b758c86d32adf07bea6bd470b4f81966d337875735e5ec0cb8fcdd'){throw new RuntimeException('Fixed synthetic corpus required.');}
    $corpus=json_decode(file_get_contents($corpusPath),true,64,JSON_THROW_ON_ERROR);$users=$corpus['users'];
    $inputPath=$argv[2]??'';$privatePath=realpath($inputPath);$privateDir=realpath($workspaceRoot.'/.local');
    if($privatePath===false||$privateDir===false||!str_starts_with($privatePath,$privateDir.DIRECTORY_SEPARATOR)||is_link($inputPath)||(fileperms($privatePath)&0077)!==0){throw new RuntimeException('Private gateway configuration required.');}
    $private=json_decode(file_get_contents($privatePath),true,16,JSON_THROW_ON_ERROR);
    if(($private['base_url']??null)!=='https://timo.aitoken.credit/v1'||($private['model']??null)!=='gemini-3.8-flash'){throw new RuntimeException('Explicit configured gateway and model required.');}
    $config=new GatewayConfig($private['base_url'],$private['model'],$private['api_key'],6144);unset($private);
    $recordPath=$workspaceRoot.'/docs/推荐模块/sources/conversation-live_2026-11-12.json';
    if(file_exists($recordPath)){$recordPath=substr($recordPath,0,-5).'-'.gmdate('Ymd\THis\Z').'-'.bin2hex(random_bytes(3)).'.json';}
    $priorRequests=0;
    foreach(glob($workspaceRoot.'/docs/推荐模块/sources/conversation-live_*.json')as$previous){
        if(str_ends_with($previous,'-review.json')){continue;}
        $old=json_decode(file_get_contents($previous),true,64,JSON_THROW_ON_ERROR);
        if(($old['corpus_sha256']??null)===$corpusHash){$priorRequests+=count($old['requests']??[]);}
    }
    if($priorRequests>=32){throw new RuntimeException('Synthetic acceptance total call cap reached.');}
    $journal=new ConversationJournal($recordPath,$corpusHash);$journal->data['generation_requests_cap']=min(16,32-$priorRequests);
    $journal->data['cumulative_prior_requests']=$priorRequests;$journal->data['cumulative_acceptance_cap']=32;$journal->data['transport_timeout_seconds']=60;
    echo json_encode(['transcript_file'=>basename($recordPath)],JSON_UNESCAPED_UNICODE).PHP_EOL;flush();
    $journal->data['implementation_sha256']=[];
    foreach(['matcher-recommendation/application/conversation','matcher-recommendation/domain/conversation','matcher-recommendation/adapters/conversation','matcher-recommendation-ai/adapters/conversation']as$area){foreach(glob($modulesPath.'/'.$area.'/*.php')as$file){$journal->data['implementation_sha256'][substr($file,strlen($workspaceRoot)+1)]=hash_file('sha256',$file);}}
    foreach([__FILE__,$modulesPath.'/matcher-recommendation/tests/conversation_integration/Fixtures.php',...glob($modulesPath.'/matcher-recommendation/contracts/ports/Conversation*.php')]as$file){$journal->data['implementation_sha256'][substr($file,strlen($workspaceRoot)+1)]=hash_file('sha256',$file);}
    $journal->save();
    $client=new ChatCompletionsClient($config,new RecordedConversationTransport($journal));$provider=new ChatConversationProvider($client);
    $p=F::ports($users);$p->platform->remaining=$journal->data['generation_requests_cap'];$retriever=new CorpusRetriever($p,$users);$search=F::search($p,$retriever);
    $dbPath=tempnam(sys_get_temp_dir(),'rec-conversation-live-');$connect=static fn()=>new PDO('sqlite:'.$dbPath,null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
    $db=$connect();ConversationStorageSchema::install($db);
    $clock=new SystemClock();
    $make=static function()use($p,$search,$provider,$connect,$clock):ConversationService{return new ConversationService($p->events,$p->policies,$p->queryValidator,$search,$p->profiles,$p->contacts,$p->platform,$provider,new PdoConversationStore($connect()),$clock,new ConversationLimits(20,40));};
    $s=$make();$v=$s->create(1,7);
    $cases=[
        ['id'=>'A1','command'=>'recommend','text'=>'我们已有产品和前端两个人。我负责产品、组织同学测试，另一个人做前端。想在这次黑客松做校园问答，缺后端和资料处理。我还没想清楚两天后该做到什么程度，先帮我把需求问清楚，不要只按兴趣标签找。'],
        ['id'=>'A2','command'=>'chat','text'=>'希望周日能给同学实际试用，先把接口、资料入库和部署做好。我确认对方这次愿意承担后端，以及能在2026年11月14日周六14点到18点（北京时间）参与联调，是不能放宽的要求，线上也可以。教育行业经历只是加分，不必全有。'],
        ['id'=>'A3','command'=>'chat','text'=>'你为什么把第二位排在这里？他真的做过部署，还是只是会那门语言？请结合资料说，不确定就直说。'],
        ['id'=>'A4','command'=>'chat','text'=>'比较第一位和第二位。我们最担心两天结束时还只能在个人电脑上跑，谁更能补这个缺口？先别找新人。'],
        ['id'=>'A5','command'=>'chat','text'=>'先不用找新人。假设联系第二位，我应该问什么才能确认他愿意负责落地，而不只是帮忙指导？给我可以修改的问题，不要替我发。'],
        ['id'=>'A6','command'=>'refresh','text'=>'我们决定不考虑刚才第二位了。请保留周六能联调、明确愿意负责后端这两个要求，再推荐几位之前没看过的人。'],
        ['id'=>'A7','command'=>'chat','text'=>'还有呢？'],
        ['id'=>'A8','command'=>'chat','text'=>'我是说目前名单里前两位怎么分工，不是再找人。继续按我们的校园问答项目聊，先把风险讲清楚。'],
        ['id'=>'A9','command'=>'chat','text'=>'把你刚才提到的风险里最关键的一项，改成一句我可以直接问候选人的话。尽量具体，先不要给我新名单。'],
    ];
    $journal->data['planned_cases']=$cases;$journal->data['policy']=$p->policies->policy;$journal->save();
    foreach($cases as $case){
        $journal->turn=$case['id'];$s=$make();$beforeCalls=count($journal->data['requests']);$beforeSearch=count($retriever->calls);$beforeRun=$v['current_run_id'];
        $restored=$s->get(1,$v['conversation_id']);
        $v=$s->submit(1,$restored['conversation_id'],$restored['version'],$case['text'],'live-'.$case['id'],$case['command'],$case['id']==='A2'?confirmedProjectRequirements():null);
        $journal->data['turns'][]=$case+['result'=>$v,'search_delta'=>count($retriever->calls)-$beforeSearch,'model_delta'=>count($journal->data['requests'])-$beforeCalls,'new_run'=>$v['current_run_id']!==$beforeRun,'restored_before_turn'=>true];$journal->save();
        echo json_encode(['turn_finished'=>$case['id'],'status'=>$v['interaction_status'],'error'=>$v['error'],'results'=>count($v['items']),'search_delta'=>count($retriever->calls)-$beforeSearch,'model_delta'=>count($journal->data['requests'])-$beforeCalls],JSON_UNESCAPED_UNICODE).PHP_EOL;flush();
        if($v['error']!==null){break;}
    }
    $journal->data['status']=count($journal->data['turns'])===count($cases)?'recorded':'partial';$journal->data['generation_requests']=count($journal->data['requests']);$journal->data['platform_reservations']=count($p->platform->reservations);$journal->data['backend_searches']=$retriever->calls;$journal->data['display_names']=array_column($users,'display_name','id');$journal->data['completed_at']=(new DateTimeImmutable('now',new DateTimeZone('Asia/Shanghai')))->format(DATE_ATOM);$journal->save();
    echo json_encode(['status'=>$journal->data['status'],'turns'=>count($journal->data['turns']),'generation_requests'=>count($journal->data['requests']),'backend_searches'=>count($retriever->calls)],JSON_UNESCAPED_UNICODE).PHP_EOL;
}catch(Throwable $error){
    $safe=['class'=>get_class($error),'location'=>basename($error->getFile()).':'.$error->getLine()];
    if($journal!==null){$journal->data['status']='interrupted';$journal->data['safe_error']=$safe;$journal->save();}
    echo json_encode(['status'=>'interrupted','safe_error'=>$safe],JSON_UNESCAPED_UNICODE).PHP_EOL;exit(1);
}finally{if($dbPath!==null){unset($s,$db);@unlink($dbPath);}}
