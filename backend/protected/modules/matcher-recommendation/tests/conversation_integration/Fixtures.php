<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\tests\conversation_integration;

use humhub\modules\matcherRecommendation\application\ai\SearchAiCandidates;
use humhub\modules\matcherRecommendation\contracts\{CurrentEventContext, QueryIntent};
use humhub\modules\matcherRecommendation\contracts\ports\CandidateRetriever;
use humhub\modules\matcherRecommendation\domain\RulePolicy;
use humhub\modules\matcherRecommendation\domain\config\PolicyValidator;
use humhub\modules\matcherRecommendation\domain\rules\DeterministicRuleEvaluator;
use humhub\modules\matcherRecommendation\tests\ai_runs\Fixtures as F;
use humhub\modules\matcherRecommendation\tests\rules\Fixtures as R;
use humhub\modules\matcherRecommendation\tests\support\FixtureEnvironment;

/** Fixed synthetic task corpus only. Never a real profile adapter or production default policy. */
final class Fixtures
{
    public static function parameters(): array
    {
        $p = R::parameters();
        $p['enabled_routes']=['structured','fulltext','semantic'];
        $p['bindings']['offers']['value_schema']['properties']['codes']['items']['enum'] = ['后端开发','资料处理','API部署','前端开发','产品验证','商业访谈','模型评估','技术指导'];
        $p['bindings']['topics']['value_schema']['enum'] = ['校园问答','教育工具','知识检索','开发者工具','社区服务','硬件'];
        $p['bindings']['preferences']['value_schema']['enum'] = ['每日短会','异步沟通','结对开发'];
        // Source is a confirmed synthetic project statement, not an inference from a language tag.
        $p['bindings']['experience'] = ['source_key'=>'synthetic_project_experience','scope'=>'global','cardinality'=>'many',
            'value_schema'=>['type'=>'string','minLength'=>1,'maxLength'=>100],'transform'=>'identity','purpose'=>'contribution','semantic'=>'capability'];
        $p['rules'][] = ['id'=>'project_experience','dimension'=>'contribution','operator'=>'similarity','query_feature'=>'experience','candidate_features'=>['experience'],'aliases'=>[]];
        PolicyValidator::assertParameters($p);
        return $p;
    }

    public static function ports(array $users): F
    {
        $f=F::create(0); $f->clock->time=new \DateTimeImmutable('2026-11-12T09:00:00+08:00');
        $p=self::parameters(); $f->policies->policy=new RulePolicy('synthetic-conversation-project-v1',$p);
        foreach($users as $u) {
            if($u['event_id']!==7) { continue; }
            $id=$u['id']; $f->profiles->rows[$id]=R::candidate($u['features'],$p,id:$id);
            $f->contacts->current[$id]=$u['relationship']+['version'=>'conversation-relation-'.$id];
            $f->contacts->history[$id]=['ever_sent'=>$u['ever_sent'],'version'=>'conversation-history-'.$id];
        }
        return $f;
    }
    public static function search(F $f, CorpusRetriever $retriever): SearchAiCandidates
    {
        return new SearchAiCandidates($f->events,$retriever,$f->profiles,$f->contacts,new DeterministicRuleEvaluator(),$f->policies);
    }
}

/** Current-event synthetic preselection. Exercises real search/rules; not a production SQL benchmark. */
final class CorpusRetriever implements CandidateRetriever
{
    public array $calls=[];
    public function __construct(private readonly F $f,private readonly array $users) {}
    public function recall(CurrentEventContext $context,QueryIntent $intent): array
    {
        $ranked=[];$other=[];$evaluator=new DeterministicRuleEvaluator();
        foreach($this->users as $u) {
            if($u['event_id']!==$context->spaceId) {$other[]=$u['id'];continue;}
            $p=$this->f->profiles->rows[$u['id']]??null;if($p===null){continue;}
            $a=$evaluator->evaluate($context,$intent,$p,$this->f->policies->policy,['structured'=>1]);
            $ranked[]=['id'=>$u['id'],'score'=>$a->sortScore];
        }
        usort($ranked,static fn(array $a,array $b):int=>($b['score']<=>$a['score'])?:strcmp($a['id'],$b['id']));
        $rows=[];foreach(array_slice($ranked,0,200) as $i=>$r){
            [$route,$rank]=$i<80?['structured',$i+1]:($i<120?['fulltext',$i-79]:['semantic',$i-119]);
            $rows[]=['target_type'=>'person','id'=>$r['id'],'routes'=>[$route=>$rank]];
        }
        $this->calls[]=['intent'=>$intent,'current_event_count'=>count($ranked),'other_event_excluded'=>$other,'recall_count'=>count($rows)];
        return $rows;
    }
}
