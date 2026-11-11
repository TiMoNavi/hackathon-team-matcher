<?php
declare(strict_types=1);
// Manual synthetic demonstration. Raw transcripts are permitted ONLY for the fixed synthetic fixture.
// No HumHub bootstrap, real accounts/database, production registration or hidden model reasoning.
ini_set('display_errors', '0'); ini_set('zend.exception_ignore_args', '1');
$workspaceRoot = dirname(__DIR__, 6);
$modulesPath = $workspaceRoot . '/backend/protected/modules';
require $modulesPath . '/matcher-recommendation/tests/support/autoload.php';
require $modulesPath . '/matcher-recommendation/tests/ai_runs/Fixtures.php';
spl_autoload_register(static function(string $class) use ($modulesPath): void {
    $prefix = 'humhub\\modules\\matcherRecommendationAi\\';
    if (str_starts_with($class, $prefix)) { $file = $modulesPath . '/matcher-recommendation-ai/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php'; if (is_file($file)) { require_once $file; } }
});
use humhub\modules\matcherRecommendation\application\ai\{AiRecommendationService, SearchAiCandidates};
use humhub\modules\matcherRecommendation\contracts\{CurrentEventContext, QueryIntent, CandidateProjection};
use humhub\modules\matcherRecommendation\contracts\ports\{AiCandidateSearch, CandidateRetriever, RuleEvaluator, RuleQueryValidator};
use humhub\modules\matcherRecommendation\domain\{RuleAssessment, RulePolicy};
use humhub\modules\matcherRecommendation\domain\rules\DeterministicRuleEvaluator;
use humhub\modules\matcherRecommendation\domain\ai\AiRecommendationException;
use humhub\modules\matcherRecommendation\tests\ai_runs\Fixtures as F;
use humhub\modules\matcherRecommendation\tests\rules\Fixtures as R;
use humhub\modules\matcherRecommendationAi\adapters\gateway\{GatewayConfig, GatewayTransport, GatewayResponse, CurlGatewayTransport, ChatCompletionsClient};
use humhub\modules\matcherRecommendationAi\adapters\provider\{ChatQueryInterpreter, ChatCandidateReranker};

final class DemoJournal
{
    public array $data;
    public string $scenario = '';
    public function __construct(private string $path, string $mode, array $corpus, string $hash)
    {
        $this->data = ['date'=>'2026-11-12','status'=>'running','mode'=>$mode,'synthetic_only'=>true,'existing_database_connected'=>false,'real_accounts_created'=>false,'corpus_sha256'=>$hash,'corpus_count'=>count($corpus['users']),'viewer'=>$corpus['viewer'],'model_calls_cap'=>12,'recording_policy'=>'Only fixed synthetic inputs and visible assistant.content; no credentials/headers/private data/reasoning_content. Human turns are agent-authored test messages, not real participant conversations.','requests'=>[],'scenarios'=>[]];
        $this->save();
    }
    public function save(): void { file_put_contents($this->path . '.tmp', json_encode($this->data, JSON_THROW_ON_ERROR|JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES) . PHP_EOL); rename($this->path . '.tmp', $this->path); }
}
final class TranscriptTransport implements GatewayTransport
{
    public function __construct(private DemoJournal $journal) {}
    public function post(#[\SensitiveParameter] GatewayConfig $config, #[\SensitiveParameter] string $requestJson): GatewayResponse
    {
        if (count($this->journal->data['requests']) >= 12) { throw new RuntimeException('Synthetic demonstration call cap reached.'); }
        $request = json_decode($requestJson, true, 64, JSON_THROW_ON_ERROR);
        $row = ['scenario'=>$this->journal->scenario,'number'=>count($this->journal->data['requests'])+1,'request_bytes'=>strlen($requestJson),'request'=>array_intersect_key($request,array_flip(['model','max_tokens','messages','response_format']))];
        $start=hrtime(true);
        try {
            $response=(new CurlGatewayTransport())->post($config,$requestJson);
            $row['http_status']=$response->status; $row['response_bytes']=strlen($response->body());
            $body=json_decode($response->body(),true); $choice=$body['choices'][0]??[];
            $row['response_model']=is_string($body['model']??null)?$body['model']:null;
            $row['finish_reason']=$choice['finish_reason']??null;
            $row['assistant_content']=is_string($choice['message']['content']??null)?$choice['message']['content']:null;
            $row['usage']=[];
            foreach(['prompt_tokens','completion_tokens','total_tokens'] as $key) { if(is_int($body['usage'][$key]??null)){$row['usage'][$key]=$body['usage'][$key];} }
            return $response;
        } finally {
            $row['elapsed_ms']=round((hrtime(true)-$start)/1e6,3);$this->journal->data['requests'][]=$row;$this->journal->save();
            echo json_encode(['model_request_recorded'=>$row['number'],'scenario'=>$row['scenario'],'http_status'=>$row['http_status']??null],JSON_UNESCAPED_UNICODE).PHP_EOL;flush();
        }
    }
}
final class DemoEvaluator implements RuleEvaluator, RuleQueryValidator
{
    public array $assessments=[];
    private DeterministicRuleEvaluator $inner;
    public function __construct() {$this->inner=new DeterministicRuleEvaluator();}
    public function validateQuery(QueryIntent $intent,RulePolicy $policy):void {$this->inner->validateQuery($intent,$policy);}
    public function evaluate(CurrentEventContext $context,QueryIntent $intent,CandidateProjection $candidate,RulePolicy $policy,array $routeRanks):RuleAssessment
    {
        $result=$this->inner->evaluate($context,$intent,$candidate,$policy,$routeRanks);
        $this->assessments[$candidate->targetId]=['qualifies'=>$result->qualifies,'rule_score'=>$result->sortScore,'diagnostics'=>$result->diagnostics,'reasons'=>$result->reasons];return $result;
    }
}
final class DemoRetriever implements CandidateRetriever
{
    public int $calls=0;public array $trace=[];
    public function __construct(private F $ports,private array $users){}
    public function recall(CurrentEventContext $context,QueryIntent $intent):array
    {
        $this->calls++;$ranked=[];$other=[];$evaluator=new DeterministicRuleEvaluator();
        foreach($this->users as $user){
            if($user['event_id']!==$context->spaceId){$other[]=$user['id'];continue;}
            $projection=$this->ports->profiles->rows[$user['id']]??null;if($projection===null){continue;}
            $a=$evaluator->evaluate($context,$intent,$projection,$this->ports->policies->policy,['structured'=>1]);
            $ranked[]=['id'=>$user['id'],'score'=>$a->sortScore];
        }
        usort($ranked,static fn(array $a,array $b):int=>($b['score']<=>$a['score'])?:strcmp($a['id'],$b['id']));
        $rows=[];foreach(array_slice($ranked,0,80) as $i=>$r){$rows[]=['target_type'=>'person','id'=>$r['id'],'routes'=>['structured'=>$i+1]];}
        $this->trace=['fixture_strategy'=>'In-memory synthetic preselection: current event only, authorized fixture projections, deterministic score, structured-route cap 80. Not production SQL/semantic search or a performance benchmark.','input_people'=>count($this->users),'current_event_people'=>count($ranked),'other_event_excluded'=>$other,'recalled_ids'=>array_column($rows,'id'),'recall_count'=>count($rows)];return $rows;
    }
}
final class DemoSearch implements AiCandidateSearch
{
    public array $trace=[];
    public function __construct(private SearchAiCandidates $inner){}
    public function search(CurrentEventContext $context,QueryIntent $intent):array
    {
        $this->trace['intent']=$intent;$rows=$this->inner->search($context,$intent);$this->trace['qualified_ids']=array_map(static fn($r)=>$r->candidate->targetId,$rows);return $rows;
    }
}
function harness(array $users,?ChatCompletionsClient $client=null,?object $sharedPlatform=null):array
{
    $f=F::create(0);$f->clock->time=new DateTimeImmutable('2026-11-12T09:00:00+08:00');
    foreach($users as $u){
        if($u['event_id']!==7){continue;}
        // Only explicitly synthetic confirmed/public fixture features enter projection; excluded data never copied.
        $f->profiles->rows[$u['id']]=R::candidate($u['features'],id:$u['id']);
        $f->contacts->current[$u['id']]=$u['relationship']+['version'=>'demo-current-'.$u['id']];
        $f->contacts->history[$u['id']]=['ever_sent'=>$u['ever_sent'],'version'=>'demo-history-'.$u['id']];
    }
    if($sharedPlatform!==null){$f->platform=$sharedPlatform;}
    if($client!==null){$f->providers->register('live-synthetic-dialogue',new ChatQueryInterpreter($client),new ChatCandidateReranker($client));}
    $evaluator=new DemoEvaluator();$retriever=new DemoRetriever($f,$users);
    $search=new DemoSearch(new SearchAiCandidates($f->events,$retriever,$f->profiles,$f->contacts,$evaluator,$f->policies));
    $service=new AiRecommendationService($f->events,$f->policies,$evaluator,$search,$f->profiles,$f->contacts,$f->platform,$f->providers,$f->clock);
    return compact('f','evaluator','retriever','search','service');
}
function enrich(array $view,array $users):array
{
    $names=array_column($users,'display_name','id');$out=$view;$out['items']=[];
    foreach($view['items'] as $item){$out['items'][]=['id'=>$item->id,'display_name'=>$names[$item->id]??$item->id,'name_source'=>'synthetic display mapping; not a production identity projection','rule_score'=>$item->ruleScore,'ai_rank'=>$item->aiRank,'evidence_ids'=>$item->evidenceIds,'backend_reasons'=>array_map(static fn($r)=>$r->description,$item->reasons)];}return $out;
}
function exclusions(array $users):array
{
    $out=[];foreach($users as $u){$why=[];if($u['event_id']!==7){$why[]='other_event';}foreach($u['relationship'] as $k=>$v){if($v){$why[]=$k;}}if($u['ever_sent']){$why[]='ever_sent';}if($why!==[]){$out[]=['id'=>$u['id'],'display_name'=>$u['display_name'],'reasons'=>$why];}}return $out;
}
function check(bool $ok,string $label,array &$checks):void {if(!$ok){throw new RuntimeException('Offline demonstration assertion failed.');}$checks[]=$label;}

$journal=null;
try{
    $mode=$argv[1]??'';if(!in_array($mode,['--offline','--allow-network'],true)){throw new RuntimeException('Explicit execution mode required.');}
    $corpusPath=$workspaceRoot.'/docs/推荐模块/examples/dialogue-demo-users_2026-11-12.json';$corpus=json_decode(file_get_contents($corpusPath),true,64,JSON_THROW_ON_ERROR);
    if(($corpus['synthetic_only']??null)!==true||count($corpus['users']??[])!==40){throw new RuntimeException('Fixed synthetic corpus required.');}
    $users=$corpus['users'];$live=$mode==='--allow-network';
    $recordPath=$workspaceRoot.'/docs/推荐模块/sources/dialogue-demo-'.($live?'live':'offline').'_2026-11-12.json';
    // A manual repeat must preserve earlier paid calls, failed responses and transcripts.
    if($live && file_exists($recordPath)){
        $recordPath=substr($recordPath,0,-5).'-'.gmdate('Ymd\THis\Z').'-'.bin2hex(random_bytes(3)).'.json';
    }
    $journal=new DemoJournal($recordPath,$live?'real_gateway_synthetic_dialogues':'offline_fake_provider_checks',$corpus,hash_file('sha256',$corpusPath));
    if($live){echo json_encode(['transcript_file'=>basename($recordPath)],JSON_UNESCAPED_UNICODE).PHP_EOL;flush();}
    $journal->data['policy']=R::parameters();$journal->data['eligibility_exclusions']=exclusions($users);
    if(!$live){
        $checks=[];$query=new QueryIntent('person',[R::condition('topics','similarity',['AI教育']),R::condition('needs','supply_demand',['后端开发'])]);
        $current=array_values(array_filter($users,static fn($u)=>$u['event_id']===7));$large=[];
        for($i=0;$i<400;$i++){$u=$current[$i%count($current)];$u['id']=(string)(3001+$i);$u['display_name']='虚构扩展用户'.($i+1);$large[]=$u;}
        foreach(['zero'=>[],'single'=>[$current[0]],'current_36_plus_other_4'=>$users,'large_400'=>$large] as $name=>$group){
            $h=harness($group);$v=$h['service']->startStructured(1,$query,7);$ids=array_map(static fn($i)=>$i->id,$v['items']);
            check($v['interaction_status']==='completed',$name.' completed',$checks);check($v['search_calls_used']===1,$name.' searches once',$checks);check(count($ids)<=5,$name.' at most five',$checks);check(count($h['f']->reranker->calls)<=1,$name.' no repair',$checks);
            $sent=$h['f']->reranker->calls[0]['summaries']??[];check(count($sent)<=24,$name.' at most 24 summaries',$checks);
            foreach($sent as $summary){check(strlen(json_encode($summary,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_PRESERVE_ZERO_FRACTION))<=768,$name.' candidate byte cap',$checks);}
            foreach($ids as $id){$u=array_values(array_filter($group,static fn($u)=>$u['id']===$id))[0];check($u['event_id']===7&&!in_array(true,$u['relationship'],true)&&!$u['ever_sent'],$name.' output eligibility',$checks);}
            $journal->data['scenarios'][]=['id'=>$name,'result'=>enrich($v,$group),'recall'=>$h['retriever']->trace,'qualified_count'=>count($h['search']->trace['qualified_ids']??[]),'model_summary_count'=>count($sent),'fake_provider'=>true];
        }
        $h=harness($users);$h['f']->contacts->historySupported=false;$reason=null;try{$h['service']->startStructured(1,$query,7);}catch(AiRecommendationException $e){$reason=$e->reason;}
        check($reason==='history_unavailable'&&$h['retriever']->calls===0&&$h['f']->modelCalls()===0,'history failure before recall/model',$checks);
        $h=harness($users);$v=$h['service']->startStructured(1,new QueryIntent('person',[R::condition('needs','supply_demand',['后端开发'],'hard')]),7);
        foreach($v['items'] as $item){$u=array_values(array_filter($users,static fn($u)=>$u['id']===$item->id))[0];check(in_array('后端开发',$u['features']['offers']??[],true),'hard contribution requires declared offer',$checks);}
        $h=harness($users);$v=$h['service']->startStructured(1,new QueryIntent('person',[R::condition('topics','similarity',['深海考古'])]),7);
        check($v['interaction_status']==='completed'&&$v['items']===[]&&$h['f']->modelCalls()===0,'zero matching evidence gives zero model calls',$checks);
        $journal->data['checks']=$checks;$journal->data['passed']=count($checks);$journal->data['status']='passed';$journal->save();echo json_encode(['status'=>'passed','checks'=>count($checks),'model_calls'=>0],JSON_UNESCAPED_UNICODE).PHP_EOL;exit(0);
    }
    $privatePath=realpath($argv[2]??'');$privateDir=realpath($workspaceRoot.'/.local');
    if($privatePath===false||$privateDir===false||!str_starts_with($privatePath,$privateDir.DIRECTORY_SEPARATOR)||is_link($argv[2])||(fileperms($privatePath)&0077)!==0){throw new RuntimeException('Private gateway configuration required.');}
    $private=json_decode(file_get_contents($privatePath),true,16,JSON_THROW_ON_ERROR);
    if(($private['base_url']??null)!=='https://timo.aitoken.credit/v1'||($private['model']??null)!=='gemini-3.8-flash'){throw new RuntimeException('Explicit configured gateway/model required.');}
    $config=new GatewayConfig($private['base_url'],$private['model'],$private['api_key'],1536);unset($private);
    $client=new ChatCompletionsClient($config,new TranscriptTransport($journal));$shared=F::create(0)->platform;$shared->remaining=12;
    $cases=[
        ['id'=>'project_complement','title'=>'项目补位：产品协调者找后端','message'=>'我想做AI教育项目。我负责产品协调，这次更需要愿意承担后端开发的搭档，偏好异步沟通。请推荐合适的人。'],
        ['id'=>'shared_interests','title'=>'兴趣交友：音乐与徒步','message'=>'想认识同样喜欢音乐和徒步的朋友，平时更偏好异步沟通。'],
        ['id'=>'clarify_goal','title'=>'先澄清再寻找商业搭档','message'=>'我想找个合适的搭档，但还没想清楚该按什么条件找。'],
        ['id'=>'honest_empty','title'=>'没有匹配证据时真实返回不足','message'=>'我想找对深海考古有共同兴趣、愿意做水下声呐的搭档。'],
    ];
    foreach($cases as $case){
        $journal->scenario=$case['id'];$h=harness($users,$client,$shared);$turns=[['speaker'=>'simulated_user','text'=>$case['message']]];
        $v=$h['service']->startChat(1,$case['message'],7);$states=[$v];
        while($v['interaction_status']==='awaiting_input'){
            $question=$v['question'];$turns[]=['speaker'=>'model_clarification','text'=>$question['text'],'options'=>$question['options']];
            $journal->data['pending_dialogue']=['scenario'=>$case,'turns'=>$turns,'view'=>enrich($v,$users)];$journal->save();
            echo json_encode(['awaiting_synthetic_answer'=>true,'scenario'=>$case['id'],'question'=>$question['text'],'options'=>$question['options']],JSON_UNESCAPED_UNICODE).PHP_EOL;flush();
            $answer=fgets(STDIN);if($answer===false||trim($answer)===''){throw new RuntimeException('Synthetic answer required; no automatic consent.');}$answer=trim($answer);
            $turns[]=['speaker'=>'simulated_user','text'=>$answer];$v=$h['service']->answer(1,$v['run_id'],$v['version'],$question['id'],$answer,'demo-answer-'.count($turns));$states[]=$v;
        }
        unset($journal->data['pending_dialogue']);
        $journal->data['scenarios'][]=$case+['turns'=>$turns,'state_transitions'=>array_map(static fn($s)=>['interaction_status'=>$s['interaction_status'],'model_calls_used'=>$s['model_calls_used'],'version'=>$s['version']],$states),'result'=>enrich($v,$users),'recall'=>$h['retriever']->trace,'search'=>$h['search']->trace,'rule_assessments'=>$h['evaluator']->assessments];$journal->save();
        echo json_encode(['scenario_finished'=>$case['id'],'status'=>$v['interaction_status'],'results'=>count($v['items']),'model_calls'=>$v['model_calls_used'],'error'=>$v['error']],JSON_UNESCAPED_UNICODE).PHP_EOL;flush();
        if($shared->remaining<=0){break;}
    }
    $journal->data['status']=count($journal->data['scenarios'])===count($cases)?'recorded':'partial';$journal->data['generation_requests']=count($journal->data['requests']);$journal->data['platform_reservations']=count($shared->reservations);$journal->data['completed_at']=(new DateTimeImmutable('now',new DateTimeZone('Asia/Shanghai')))->format(DATE_ATOM);$journal->save();
    echo json_encode(['status'=>$journal->data['status'],'scenarios'=>count($journal->data['scenarios']),'generation_requests'=>count($journal->data['requests'])],JSON_UNESCAPED_UNICODE).PHP_EOL;
}catch(Throwable $error){
    if($journal!==null){$journal->data['status']='interrupted';$journal->data['safe_error']=['class'=>get_class($error),'location'=>basename($error->getFile()).':'.$error->getLine()];$journal->save();}
    echo json_encode(['status'=>'interrupted','error_class'=>get_class($error),'location'=>basename($error->getFile()).':'.$error->getLine()]).PHP_EOL;exit(1);
}
