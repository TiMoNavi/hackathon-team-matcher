<?php
declare(strict_types=1);
require_once dirname(__DIR__).'/support/autoload.php';
require_once dirname(__DIR__).'/ai_runs/Fixtures.php';
require_once __DIR__.'/Fixtures.php';
use humhub\modules\matcherRecommendation\application\conversation\ConversationService;
use humhub\modules\matcherRecommendation\adapters\conversation\InMemoryConversationStore;
use humhub\modules\matcherRecommendation\contracts\ports\ConversationProvider;
use humhub\modules\matcherRecommendation\domain\conversation\ConversationLimits;
use humhub\modules\matcherRecommendation\domain\ai\AiRecommendationException;
use humhub\modules\matcherRecommendation\tests\conversation_integration\{Fixtures as F,CorpusRetriever};

final class SafetyProvider implements ConversationProvider
{
    public array $calls=[];public ?Closure $hook=null;public bool $ask=false;public bool $invalid=false;
    public function plan(array $input,string $permit):array{
        $this->calls[]=['stage'=>'plan','input'=>$input];if($this->hook!==null){($this->hook)($input);}
        return $this->ask?['action'=>'clarify','message'=>'请补充哪段时间需要一起联调？','conditions'=>[]]:['action'=>'search','message'=>'按本次明确贡献检索。','conditions'=>[['feature'=>'needs','operator'=>'supply_demand','value'=>['后端开发'],'strength'=>'soft','origin'=>'interpreted_draft']]];
    }
    public function respond(array $input,string $permit):array{
        $this->calls[]=['stage'=>'respond','input'=>$input];if($this->hook!==null){($this->hook)($input);}
        if($this->invalid){return ['message'=>'invalid synthetic output','items'=>[['id'=>'9999999','fact_ids'=>['f1'],'reason'=>'invalid','gaps'=>[]]]];}
        $items=[];foreach(array_slice($input['candidates'],0,5)as$c){$fact=current(array_filter($c['facts'],static fn($f)=>$f['positive']));$items[]=['id'=>$c['id'],'fact_ids'=>[$fact['id']],'reason'=>'有本次后端贡献依据。','gaps'=>['具体责任待确认。']];}
        return ['message'=>'按当前已获准事实继续讨论。','items'=>$items];
    }
}
function checkSafe(bool $ok,string $label):void{global $checks;if(!$ok){throw new RuntimeException('FAIL: '.$label);}$checks[]=$label;}
function safeHarness(array $users,?ConversationLimits $limits=null):array{
    $p=F::ports($users);$p->platform->remaining=40;$r=new CorpusRetriever($p,$users);$search=F::search($p,$r);$provider=new SafetyProvider();$store=new InMemoryConversationStore();
    $limits??=new ConversationLimits(20,40);$make=static fn()=>new ConversationService($p->events,$p->policies,$p->queryValidator,$search,$p->profiles,$p->contacts,$p->platform,$provider,$store,$p->clock,$limits);
    return [$make(),$p,$r,$provider,$store,$make];
}
function startSafe($s):array{$v=$s->create(1,7);return $s->submit(1,$v['conversation_id'],$v['version'],'我们已有产品和前端，先看看愿意补后端的人。','start','recommend');}
$checks=[];$workspaceRoot=dirname(__DIR__,6);$users=json_decode(file_get_contents($workspaceRoot.'/docs/推荐模块/examples/conversation-project-corpus_2026-11-12.json'),true,64,JSON_THROW_ON_ERROR)['users'];
[$s,$p,$r,$provider,$store,$make]=safeHarness($users,new ConversationLimits(20,2));$v=startSafe($s);$s=$make();$v=$s->submit(1,$v['conversation_id'],$v['version'],'解释第二位，不找新人。','budget-discussion','chat');
checkSafe($v['error']==='budget_exhausted'&&count($provider->calls)===2&&count($r->calls)===1,'conversation call cap persists across new service and blocks discussion without new cost');
[$s,$p,$r,$provider,$store,$make]=safeHarness($users);$v=startSafe($s);$provider->invalid=true;$v=$s->submit(1,$v['conversation_id'],$v['version'],'解释第二位。','invalid-discussion','chat');
checkSafe($v['error']==='invalid_model_output'&&count($provider->calls)===4&&count($r->calls)===1,'discussion allows exactly one counted repair and never re-searches');
[$s,$p,$r,$provider]=safeHarness($users);$provider->invalid=true;$v=startSafe($s);
checkSafe($v['error']==='invalid_model_output'&&$v['items']===[]&&count($provider->calls)===3&&count($r->calls)===1,'initial malformed recommendation ends after three calls and one search');
[$s,$p,$r,$provider]=safeHarness($users);$provider->ask=true;$v=$s->create(1,7);
for($i=0;$i<4;$i++){$v=$s->submit(1,$v['conversation_id'],$v['version'],'请继续帮我厘清项目分工。','clarify-'.$i,$i===0?'recommend':'chat');if($v['error']!==null){break;}}
checkSafe($v['error']!==null&&count($provider->calls)<=4&&count($r->calls)===0,'endless clarification ends within run budget without hidden search');
[$s,$p,$r,$provider,$store,$make]=safeHarness($users);$reentrant=null;
$provider->hook=static function(array $input)use($store,$make,&$reentrant):void{if(isset($input['mode'])){return;}$s2=$make();global $activeConversation;$snap=$store->load($activeConversation,1);try{$s2->submit(1,$activeConversation,$snap['version'],'竞争请求','compete','chat');$reentrant='accepted';}catch(AiRecommendationException $e){$reentrant=$e->reason;}};
$v=$s->create(1,7);$activeConversation=$v['conversation_id'];$v=$s->submit(1,$v['conversation_id'],$v['version'],'找愿意后端的人。','winner','recommend');
checkSafe($reentrant==='run_conflict'&&$v['error']===null&&count($provider->calls)===2,'another service cannot enter while a persisted model claim is active');
[$s,$p,$r,$provider,$store,$make]=safeHarness($users);$v=$s->create(1,7);$snap=$store->load($v['conversation_id'],1);$snap['inflight']=['token'=>'synthetic-crash','expires_at'=>$p->clock->now()->getTimestamp()-1];$snap['version']++;$store->compareAndSwap($v['conversation_id'],1,$v['version'],$snap);$v=$make()->get(1,$v['conversation_id']);
checkSafe($v['error']!==null&&$v['execution_status']==='failed'&&$provider->calls===[],'expired persisted claim becomes failed instead of reissuing a paid operation');
[$s,$p,$r,$provider,$store,$make]=safeHarness($users);$v=startSafe($s);$calls=count($provider->calls);$p->events->available=false;$v=$make()->get(1,$v['conversation_id']);
checkSafe($v['applicability']==='revoked'&&$v['items']===[]&&count($provider->calls)===$calls,'current event revocation clears display without a model request');
[$s,$p,$r,$provider]=safeHarness($users);$p->platform->remaining=0;$v=startSafe($s);
checkSafe($v['error']==='budget_exhausted'&&$provider->calls===[]&&$r->calls===[],'platform refusal is explicit and never becomes a zero-result recommendation');
[$s,$p,$r,$provider]=safeHarness($users);$p->contacts->historySupported=false;$reason=null;try{$s->create(1,7);}catch(AiRecommendationException $e){$reason=$e->reason;}
checkSafe($reason==='history_unavailable'&&$provider->calls===[]&&$r->calls===[],'missing authoritative history blocks before paid work');
[$s,$p,$r,$provider,$store,$make]=safeHarness($users);$v=startSafe($s);$firstBatch=$v['current_batch']['batch_id'];$oldIds=array_column($v['items'],'id');
$v=$s->submit(1,$v['conversation_id'],$v['version'],'请再找之前没有看过的人。','fresh-batch','refresh');$newIds=array_column($v['items'],'id');unset($p->profiles->rows[$oldIds[0]]);$callsBeforeRevocation=count($provider->calls);
$v=$s->submit(1,$v['conversation_id'],$v['version'],'继续讨论当前名单，不搜索。','discuss-after-revoke','chat');
$oldTurns=array_values(array_filter($v['turns'],static fn($t)=>$t['batch_id']===$firstBatch));
// This refresh used the same conversation and visible prior batch. Its prose cannot
// be proven independent of that source; the separate preintegration suite verifies
// that an unrelated fresh conversation remains usable after this source is revoked.
checkSafe($newIds!==[]&&$v['applicability']==='revoked'&&$v['items']===[]&&$oldTurns[0]['items']===[]&&$oldTurns[0]['message']==='','direct submit removes revoked source prose and invalidates its dependent refreshed display');
checkSafe(count($provider->calls)===$callsBeforeRevocation,'revoked source and derived prose are rejected before any new model request');
[$s,$p,$r,$provider,$store,$make]=safeHarness($users);$v=startSafe($s);$p->profiles->onRead=static function():void{throw new RuntimeException('synthetic authorized projection outage');};$calls=count($provider->calls);$v=$make()->get(1,$v['conversation_id']);
checkSafe($v['applicability']==='revoked'&&$v['items']===[]&&count($provider->calls)===$calls&&array_reduce($v['turns'],static fn($ok,$t)=>$ok&&$t['items']===[],true),'projection outage cannot serve old cards or candidate text');
$large=[];for($i=0;$i<50;$i++){$u=$users[0];$u['id']=(string)(80001+$i);$large[]=$u;}
[$s,$p,$r,$provider]=safeHarness($large);$provider->hook=static function(array $input)use($p):void{
    if(($input['mode']??null)!=='recommend'){return;}
    foreach($p->profiles->rows as $id=>$row){if(!in_array((string)$id,array_column($input['candidates'],'id'),true)&&in_array('后端开发',$row->features['offers']['value'],true)&&!in_array(true,array_intersect_key($p->contacts->current[$id],array_flip(['blocked','friend','pending_in','pending_out'])),true)&&!$p->contacts->history[$id]['ever_sent']){unset($p->profiles->rows[$id]);return;}}
};$v=startSafe($s);
checkSafe($v['error']==='context_invalidated'&&$v['items']===[]&&count($r->calls)===1,'post-model revocation of qualified but unsent person invalidates the complete source pool');
[$s,$p,$r,$provider]=safeHarness($users);$parameters=$p->policies->policy->parameters;$parameters['limits']['request_bytes']=1024;$p->policies->policy=new \humhub\modules\matcherRecommendation\domain\RulePolicy('small-request-policy',$parameters);$v=startSafe($s);
checkSafe($v['error']==='request_budget_exceeded'&&$provider->calls===[]&&$p->platform->reservations===[],'configured request cap below framing needs fails before any paid permit');
[$s,$p,$r,$provider]=safeHarness($users);$parameters=$p->policies->policy->parameters;$parameters['limits']['final_results']=2;$p->policies->policy=new \humhub\modules\matcherRecommendation\domain\RulePolicy('two-results-policy',$parameters);$v=startSafe($s);
checkSafe($v['error']==='invalid_model_output'&&$v['items']===[]&&count($provider->calls)===3,'configured result cap rejects five-result provider including one bounded repair');
echo json_encode(['suite'=>'conversation_safety','status'=>'passed','checks'=>count($checks),'labels'=>$checks,'network_calls'=>0],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR).PHP_EOL;
