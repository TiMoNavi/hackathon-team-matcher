<?php
declare(strict_types=1);
require_once dirname(__DIR__).'/support/autoload.php';
require_once dirname(__DIR__).'/ai_runs/Fixtures.php';
require_once __DIR__.'/Fixtures.php';
use humhub\modules\matcherRecommendation\application\conversation\ConversationService;
use humhub\modules\matcherRecommendation\adapters\conversation\{InMemoryConversationStore,PdoConversationStore,ConversationStorageSchema};
use humhub\modules\matcherRecommendation\contracts\{QueryIntent};
use humhub\modules\matcherRecommendation\contracts\ports\{ConversationProvider,ConversationStore};
use humhub\modules\matcherRecommendation\domain\conversation\ConversationLimits;
use humhub\modules\matcherRecommendation\tests\conversation_integration\{Fixtures as F,CorpusRetriever};
use humhub\modules\matcherRecommendation\tests\rules\Fixtures as R;

final class ScriptedConversation implements ConversationProvider
{
    public array $calls=[];
    public bool $clarify=true;
    public function plan(array $input,string $permit):array
    {
        $this->calls[]=['stage'=>'plan','input'=>$input];
        if($this->clarify){$this->clarify=false;return ['action'=>'clarify','message'=>'你希望周日现场演示，还是给同学实际试用？需要搭档在哪段时间参与联调？','conditions'=>[]];}
        return ['action'=>'search','message'=>'先按本次愿意承担的贡献和你确认的时间要求检索。','conditions'=>[
            ['feature'=>'needs','operator'=>'supply_demand','value'=>['后端开发'],'strength'=>'soft','origin'=>'interpreted_draft']]];
    }
    public function respond(array $input,string $permit):array
    {
        $this->calls[]=['stage'=>'respond','input'=>$input];$items=[];
        foreach(array_slice($input['candidates'],0,5) as $c){
            $facts=array_values(array_filter($c['facts'],static fn($f)=>$f['positive']));
            if($facts===[]){continue;}
            $items[]=['id'=>$c['id'],'fact_ids'=>[$facts[0]['id']],'reason'=>'本次明确愿意承担后端开发，可以补团队的后端缺口。','gaps'=>['具体分工与部署责任仍需沟通。']];
        }
        return ['message'=>$input['mode']==='discuss'?'继续按当前名单讨论，需要区分明确的贡献意愿与尚未确认的交付承诺。':'这些人有本次后端贡献依据，时间是否覆盖按后端确认条件校验。','items'=>$items];
    }
}
function verify(bool $ok,string $label):void {global $checks;if(!$ok){throw new RuntimeException('FAIL: '.$label);}$checks[]=$label;}
function makeService($p,$search,ConversationProvider $provider,ConversationStore $store):ConversationService
{
    return new ConversationService($p->events,$p->policies,$p->queryValidator,$search,$p->profiles,$p->contacts,$p->platform,$provider,$store,$p->clock,new ConversationLimits(20,40));
}
function hardQuery():QueryIntent{return new QueryIntent('person',[
    R::condition('needs','supply_demand',['后端开发'],'hard'),
    R::condition('availability','interval_overlap',[['starts_at'=>'2026-11-14T14:00:00+08:00','ends_at'=>'2026-11-14T18:00:00+08:00']],'hard')]);}
function ids(array $view):array{return array_column($view['items'],'id');}
$checks=[];$workspaceRoot=dirname(__DIR__,6);
$corpus=json_decode(file_get_contents($workspaceRoot.'/docs/推荐模块/examples/conversation-project-corpus_2026-11-12.json'),true,64,JSON_THROW_ON_ERROR);
$users=$corpus['users'];
foreach(['memory','sqlite'] as $backend){
    $p=F::ports($users);$retriever=new CorpusRetriever($p,$users);$search=F::search($p,$retriever);$provider=new ScriptedConversation();
    $temp=$backend==='sqlite'?tempnam(sys_get_temp_dir(),'rec-conv-integration-'):null;
    $connect=static fn()=>new PDO('sqlite:'.$temp,null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
    if($temp!==null){$db=$connect();ConversationStorageSchema::install($db);$store=new PdoConversationStore($db);}else{$store=new InMemoryConversationStore();}
    try{
        $s=makeService($p,$search,$provider,$store);$v=$s->create(1,7);
        $v=$s->submit(1,$v['conversation_id'],$v['version'],'已有产品和前端，想两天内做校园问答，缺后端和资料处理。','t1','recommend');
        verify($v['error']===null&&$v['items']===[]&&count($retriever->calls)===0,$backend.' clarification before search');$run=$v['current_run_id'];
        if($temp!==null){$store=new PdoConversationStore($connect());}
        $s=makeService($p,$search,$provider,$store);$v=$s->get(1,$v['conversation_id']);
        $v=$s->submit(1,$v['conversation_id'],$v['version'],'周日给同学试用。我确认后端贡献和周六14到18点联调为必需，领域经历只加分。','t2','chat',hardQuery());
        verify($v['error']===null&&count($v['items'])>0&&count($v['items'])<=5,$backend.' confirmed constraints yield bounded list');
        verify($run===$v['current_run_id']&&count($retriever->calls)===1,$backend.' clarification continues same run with one real search');
        $first=ids($v);$batch=$v['current_batch'];$calls=count($provider->calls);
        foreach($first as $id){$u=array_values(array_filter($users,static fn($u)=>$u['id']===$id))[0];verify($u['event_id']===7&&in_array('后端开发',$u['features']['offers'],true)&&isset($u['features']['availability'])&&$u['features']['availability'][0]['starts_at']==='2026-11-14T14:00:00+08:00'&&!in_array(true,$u['relationship'],true)&&!$u['ever_sent'],$backend.' final person satisfies actual hard constraints and eligibility');}
        $s=makeService($p,$search,$provider,$store);$restored=$s->get(1,$v['conversation_id']);
        verify(ids($restored)===$first&&count($provider->calls)===$calls,$backend.' fresh service restores without paid calls');
        $before=$restored['version'];$v=$s->submit(1,$restored['conversation_id'],$before,'比较第一位和第二位，不找新人。','t3','chat');
        verify($v['error']===null&&ids($v)===$first&&$v['current_batch']['batch_id']===$batch['batch_id']&&count($retriever->calls)===1,$backend.' discussion preserves displayed batch and does not retrieve');
        $calls=count($provider->calls);$replay=$s->submit(1,$v['conversation_id'],$before,'比较第一位和第二位，不找新人。','t3','chat');
        verify(count($provider->calls)===$calls&&ids($replay)===$first,$backend.' replay does not charge or search');
        $v=$s->submit(1,$v['conversation_id'],$v['version'],'再推荐几位之前没有看过的，保留刚才确认的要求。','t4','refresh');
        verify($v['error']===null&&$v['current_run_id']!==$run&&count($retriever->calls)===2&&array_intersect($first,ids($v))===[],$backend.' explicit refresh excludes old batch and preserves hard requirements');
        $calls=count($provider->calls);$count=count($retriever->calls);$v=$s->submit(1,$v['conversation_id'],$v['version'],'还有呢？','t5','chat');
        verify(count($retriever->calls)===$count,$backend.' ambiguous followup never starts search');
        foreach($provider->calls as $call){if($call['stage']!=='respond'){continue;}$input=$call['input'];verify(count($input['candidates'])<=24,$backend.' candidate count bounded');foreach($input['candidates'] as $candidate){verify(strlen(json_encode($candidate,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR))<=768,$backend.' minimal candidate byte bound');}}
    }finally{if($temp!==null){unset($s,$store,$db);@unlink($temp);}}
}
foreach([0,1,32,400] as $size){
    $group=[];for($i=0;$i<$size;$i++){$u=$users[$i%36];$u['id']=(string)(10001+$i);$u['event_id']=7;$group[]=$u;}
    $p=F::ports($group);$retriever=new CorpusRetriever($p,$group);$search=F::search($p,$retriever);$provider=new ScriptedConversation();$provider->clarify=false;
    $s=makeService($p,$search,$provider,new InMemoryConversationStore());$v=$s->create(1,7);$v=$s->submit(1,$v['conversation_id'],$v['version'],'先看符合后端和联调要求的人。','size-'.$size,'recommend',hardQuery());
    verify($v['error']===null&&count($v['items'])<=5&&count($retriever->calls)===1,'pool '.$size.' bounded real search completion');
    if($size===0){verify($v['items']===[]&&count(array_filter($provider->calls,static fn($c)=>$c['stage']==='respond'))===0,'empty roster skips reranking');}
    verify(($retriever->calls[0]['recall_count']??0)<=200,'pool '.$size.' recall limit');
}
foreach(['hard_no_match','soft_preference_unmet'] as $scenario){
    $group=[$users[$scenario==='hard_no_match'?4:0]];$p=F::ports($group);$retriever=new CorpusRetriever($p,$group);$search=F::search($p,$retriever);$provider=new ScriptedConversation();$provider->clarify=false;
    $query=hardQuery();if($scenario==='soft_preference_unmet'){$query=new QueryIntent('person',[...$query->conditions,R::condition('topics','similarity',['教育工具'])]);}
    $s=makeService($p,$search,$provider,new InMemoryConversationStore());$v=$s->create(1,7);$v=$s->submit(1,$v['conversation_id'],$v['version'],'后端和周六联调不能放宽，教育领域只加分。',$scenario,'recommend',$query);
    verify($v['error']===null&&count($retriever->calls)===1,$scenario.' real bounded search');
    if($scenario==='hard_no_match'){verify($v['items']===[]&&count(array_filter($provider->calls,static fn($c)=>$c['stage']==='respond'))===0,'Sunday-only candidate cannot fill Saturday hard requirement and no rerank is charged');}
    else{verify(ids($v)===[$group[0]['id']],'missing optional education topic still permits evidence-backed backend collaborator');}
}
echo json_encode(['suite'=>'conversation_integration','status'=>'passed','checks'=>count($checks),'network_calls'=>0,'storage'=>['memory','new temporary SQLite files'],'real_components'=>['ConversationService','SearchAiCandidates','DeterministicRuleEvaluator'],'synthetic_only'=>true],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR).PHP_EOL;
