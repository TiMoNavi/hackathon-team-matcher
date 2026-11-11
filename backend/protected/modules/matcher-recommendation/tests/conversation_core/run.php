<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/support/autoload.php';
require_once dirname(__DIR__) . '/ai_runs/Fixtures.php';
require_once dirname(__DIR__) . '/conversation_integration/Fixtures.php';
use humhub\modules\matcherRecommendation\application\conversation\ConversationService;
use humhub\modules\matcherRecommendation\adapters\conversation\InMemoryConversationStore;
use humhub\modules\matcherRecommendation\contracts\{QueryIntent};
use humhub\modules\matcherRecommendation\contracts\ports\ConversationProvider;
use humhub\modules\matcherRecommendation\domain\{DiscoveryMatch,RulePolicy};
use humhub\modules\matcherRecommendation\domain\conversation\{ConversationCandidateSummaries,ConversationInput,ConversationLimits};
use humhub\modules\matcherRecommendation\domain\rules\DeterministicRuleEvaluator;
use humhub\modules\matcherRecommendation\tests\conversation_integration\{Fixtures as F,CorpusRetriever};
use humhub\modules\matcherRecommendation\tests\rules\Fixtures as R;
use humhub\modules\matcherRecommendation\tests\support\FixtureEnvironment;

function verifyCore(bool $ok, string $label):void { global $checks; if(!$ok){throw new RuntimeException('FAIL: '.$label);} $checks[]=$label; }
final class CoreProvider implements ConversationProvider
{
    public array $inputs=[];
    public function plan(array $input,string $permit):array {
        return ['action'=>'search','message'=>'保留硬条件，同时比较资料处理意愿。','conditions'=>[
            ['feature'=>'needs','operator'=>'supply_demand','value'=>['后端开发'],'strength'=>'soft','origin'=>'interpreted_draft'],
            ['feature'=>'needs','operator'=>'supply_demand','value'=>['资料处理'],'strength'=>'soft','origin'=>'interpreted_draft']]];
    }
    public function respond(array $input,string $permit):array {
        $this->inputs[]=$input;$items=[];
        foreach(array_slice($input['candidates'],0,5) as $c){$positive=array_values(array_filter($c['facts'],static fn($f)=>$f['positive']));$items[]=['id'=>$c['id'],'fact_ids'=>[$positive[0]['id']],'reason'=>'有明确贡献依据。','gaps'=>['具体分工仍需确认。']];}
        return ['message'=>'硬条件由后端核验，资料处理是加分项。','items'=>$items];
    }
}
$checks=[];$workspaceRoot=dirname(__DIR__,6);
$users=json_decode(file_get_contents($workspaceRoot.'/docs/推荐模块/examples/conversation-project-corpus_2026-11-12.json'),true,64,JSON_THROW_ON_ERROR)['users'];
$p=F::ports($users);$r=new CorpusRetriever($p,$users);$search=F::search($p,$r);$provider=new CoreProvider();
$s=new ConversationService($p->events,$p->policies,$p->queryValidator,$search,$p->profiles,$p->contacts,$p->platform,$provider,new InMemoryConversationStore(),$p->clock,new ConversationLimits(20,40));
$hard=new QueryIntent('person',[R::condition('needs','supply_demand',['后端开发'],'hard'),R::condition('availability','interval_overlap',[['starts_at'=>'2026-11-14T14:00:00+08:00','ends_at'=>'2026-11-14T18:00:00+08:00']],'hard')]);
$v=$s->create(1,7);$v=$s->submit(1,$v['conversation_id'],$v['version'],'确认后端和周六联调为硬要求，资料处理只是加分。','core-1','recommend',$hard);
verifyCore($v['error']===null&&$v['items']!==[],'mixed hard and soft requirements complete');
$conditions=$r->calls[0]['intent']->conditions;
verifyCore(count($conditions)===3,'only exactly equivalent soft condition is removed');
$soft=array_values(array_filter($conditions,static fn($c)=>$c['feature']==='needs'&&$c['strength']==='soft'));
verifyCore(count($soft)===1&&$soft[0]['value']===['资料处理'],'same feature different soft value survives search');
verifyCore($provider->inputs[0]['requirements']['conditions']===$conditions,'provider receives preserved soft preference');
foreach($provider->inputs[0]['candidates'] as $c){
    verifyCore(count(array_filter($c['facts'],static fn($f)=>$f['feature']==='availability'))>0,'hard availability survives summary '.$c['id']);
    verifyCore(strlen(ConversationInput::json($c))<=768,'candidate remains bounded '.$c['id']);
}
$policy=$p->policies->policy;
verifyCore(ConversationInput::conditionKey(R::condition('needs','supply_demand',['后端开发','资料处理']),$policy)===ConversationInput::conditionKey(R::condition('needs','supply_demand',['资料处理','后端开发']),$policy),'set order does not defeat equivalence');
verifyCore(ConversationInput::conditionKey(R::condition('needs','supply_demand','后端开发'),$policy)===ConversationInput::conditionKey(R::condition('needs','supply_demand',['后端开发']),$policy),'scalar and single token list are equivalent');
$params=F::parameters();$values=['offers'=>['后端开发'],'availability'=>[['starts_at'=>'2026-11-14T14:00:00+08:00','ends_at'=>'2026-11-14T18:00:00+08:00']],'skills'=>['Python','TypeScript','PHP','SQL','Docker','Redis'],'experience'=>['独立部署过FastAPI接口','负责过校园资料清洗','参与过模型评估']];
$candidate=R::candidate($values,$params,id:'99001');$evaluator=new DeterministicRuleEvaluator();
$assessment=$evaluator->evaluate(R::context(),$hard,$candidate,new RulePolicy('summary-hard',$params),['structured'=>1]);
$match=new DiscoveryMatch($candidate,$assessment,FixtureEnvironment::relationship());
$pack=(new ConversationCandidateSummaries())->build([$match],$hard,new RulePolicy('summary-hard',$params));
verifyCore(count($pack['candidates'])===1,'rich candidate remains eligible');
$summary=$pack['candidates'][0];
verifyCore($summary['facts'][0]['feature']==='availability'&&$summary['facts'][1]['feature']==='offers','hard evidence precedes optional skill and experience atoms');
verifyCore($summary['omitted_fact_count']>0&&count(array_filter($summary['facts'],static fn($f)=>$f['feature']==='availability'))===1,'omission removes optional facts without losing confirmed time');
$params['limits']['candidate_bytes']=256;
$small=(new ConversationCandidateSummaries())->build([$match],$hard,new RulePolicy('summary-too-small',$params));
verifyCore($small['candidates']===[],'candidate is skipped when all hard evidence cannot fit honestly');
echo json_encode(['suite'=>'conversation_core','status'=>'passed','checks'=>count($checks),'network_calls'=>0,'focus'=>['hard-soft condition preservation','complete hard-evidence packaging']],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR).PHP_EOL;
