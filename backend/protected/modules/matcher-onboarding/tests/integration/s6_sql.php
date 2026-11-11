<?php
declare(strict_types=1);
ob_start();require __DIR__.'/s6_fixture.php';$fixture=json_decode(ob_get_clean(),true,32,JSON_THROW_ON_ERROR);
use humhub\modules\matcherProfile\adapters\persistence\AiJobSchemaInstaller;
use humhub\modules\matcherProfile\application\QuestionService;
use humhub\modules\matcherProfile\domain\ports\ProfileAiEngine;
use humhub\modules\matcherProfile\domain\rules\RuleQuestionProvider;
use humhub\modules\matcherProfile\domain\rules\RulesProfileComposer;
use humhub\modules\matcherProfile\domain\ProfileException;
$checks=[];$ok=static function(string $name,bool $value)use(&$checks){if(!$value)throw new RuntimeException($name);$checks[]=$name;};
try{
    (new AiJobSchemaInstaller($app->db))->install();(new AiJobSchemaInstaller($app->db))->install();$ok('migration_is_additive_and_repeatable',true);
    $owner=$fixture['users']['owner'];$space=$fixture['spaces'][0];$p=$app->getModule('matcher-user-profile');$p2=$app->getModule('matcher-onboarding');$flow=$p2->getOnboardingService();$ai=$p2->getAiJobService();
    $engine=new class($app->db,$ok) implements ProfileAiEngine {
        public int $calls=0;public ?Closure $during=null;
        public function __construct(private $db,private $ok){}
        public function status(): array{return ['available'=>true,'model'=>'synthetic-sql'];}
        public function generate(string $op,array $input): array{
            ($this->ok)('model_outside_SQL_transaction_'.++$this->calls,!$this->db->getTransaction()?->isActive);
            if($this->during!==null)($this->during)();
            if($op==='extract'){$s=$input['sources'][0];$data=['candidates'=>[['id'=>'synthetic','key'=>'headline','value'=>'Synthetic SQL engineer','evidence'=>[['source_id'=>$s['source_id'],'source_version'=>$s['version'],'section_id'=>$s['sections'][0]['id']]]]],'review_items'=>[]];}
            elseif($op==='questions'){$questions=(new RuleQuestionProvider())->questions($input['profiles'],$input['space_id']);foreach($questions as &$q)$q['free_text_option']=['code'=>'other','label'=>'其他，我来填写','position'=>'last','max_length'=>1000];unset($q);$data=['questions'=>$questions,'review_items'=>[]];}
            else{$data=(new RulesProfileComposer())->compose($input['profiles'],$input['questions'],$input['answers']);unset($data['generation_mode'],$data['llm_calls']);$data['review_items']=[];}
            return ['data'=>$data,'metrics'=>['model'=>'synthetic-sql','llm_calls'=>1,'duration_ms'=>1,'usage'=>['prompt_tokens'=>10,'completion_tokens'=>10,'total_tokens'=>20,'reported'=>true]]];
        }
    };
    $ai=new \humhub\modules\matcherProfile\application\ProfileAiJobService($p->getAiJobRepository(),new \humhub\modules\matcherOnboarding\application\OnboardingAiWorkflow($p->getProfileWorkflow(),$p2->getOnboardingRepository(),$p->getQuestionRepository(),$p->getSourceRepository()),fn()=>$engine);$s=$flow->start($owner,$space);$source=$p->getSourceService()->import($owner,'text',['text'=>'Title: Synthetic SQL engineer','ownership'=>'self'],'s6-sql-import-key');
    $request=['session_id'=>$s['id'],'expected_version'=>$s['version'],'sources'=>[['source_id'=>$source['id'],'expected_version'=>$source['version']]]];$j=$ai->submit($owner,'extract',$request,'s6-sql-extract-key');$ok('SQL_submit_queued_zero_model',$j['execution_status']==='queued'&&$engine->calls===0);$ok('SQL_idempotency_replays',$ai->submit($owner,'extract',$request,'s6-sql-extract-key')['job_id']===$j['job_id']);
    $j=$ai->work($j['job_id']);$ok('SQL_extract_succeeded',$j['execution_status']==='succeeded'&&$j['applicability']==='current');$ok('SQL_input_cleared_after_success',$p->getAiJobRepository()->find($j['job_id'])['input']===[]);
    $adopt=$ai->apply($owner,$j['job_id'],['draft_id'=>$s['input_drafts']['global']['id'],'expected_draft_version'=>1,'candidate_ids'=>['synthetic']],'s6-sql-adopt-key');$ok('SQL_adoption_keeps_profile_unconfirmed',$p->getProfileWorkflow()->profiles($owner,$space)['global']['revision']===0&&count($adopt['draft']['fields'])===1);
    $s=$flow->get($owner,$s['id']);$versions=[];foreach($s['input_drafts'] as $scope=>$d)if($d!==null)$versions[$scope]=['draft_version'=>$d['draft_version'],'base_revision'=>$d['base_revision']];$s=$flow->update($owner,$s['id'],$s['version'],['action'=>'review_confirm','confirmation_intent'=>'confirm','draft_versions'=>$versions]);
    $j=$ai->submit($owner,'questions',['session_id'=>$s['id'],'expected_version'=>$s['version']],'s6-sql-questions-key');$j=$ai->work($j['job_id']);$ok('SQL_questions_succeeded',$j['execution_status']==='succeeded');$s=$flow->get($owner,$s['id']);$batch=$s['question_batch'];$ok('SQL_actual_batch_metrics',$batch['llm_calls']===1&&$s['llm_calls']===1);
    foreach($batch['questions'] as $q)$batch=$p->getQuestionService()->answer($owner,$batch['id'],$q['id'],0,['answer_type'=>'options','selected_options'=>[$q['options'][0]['code']]]);
    $s=$flow->get($owner,$s['id']);$j=$ai->submit($owner,'compose',['session_id'=>$s['id'],'expected_version'=>$s['version'],'expected_batch_version'=>$batch['version']],'s6-sql-compose-key');$j=$ai->work($j['job_id']);$ok('SQL_compose_succeeded',$j['execution_status']==='succeeded');$s=$flow->get($owner,$s['id']);$ok('SQL_compose_keeps_drafts_unconfirmed',$s['stage']==='draft'&&$s['profiles']['global']['revision']===1&&$s['profiles']['space']['revision']===0&&$s['llm_calls']===2);
    $ok('SQL_job_contains_only_output_references',!isset($j['result']['global_fields'],$j['result']['space_fields']));
    $s=$flow->update($owner,$s['id'],$s['version'],['action'=>'move','stage'=>'privacy']);$versions=[];foreach($s['output_drafts'] as $scope=>$d)if($d!==null)$versions[$scope]=['draft_version'=>$d['draft_version'],'base_revision'=>$d['base_revision']];$s=$flow->update($owner,$s['id'],$s['version'],['action'=>'complete','confirmation_intent'=>'confirm','draft_versions'=>$versions,'expected_batch_version'=>$batch['version']]);$ok('SQL_both_scopes_confirm_atomically',$s['status']==='completed'&&$s['profiles']['global']['revision']===2&&$s['profiles']['space']['revision']===1);
    $s=$flow->start($owner,$space);$j=$ai->submit($owner,'extract',['session_id'=>$s['id'],'expected_version'=>$s['version'],'sources'=>[['source_id'=>$source['id'],'expected_version'=>$source['version']]]],'s6-sql-delete-key');$j=$ai->work($j['job_id']);$p->getSourceService()->delete($owner,$source['id'],$source['version']);$raw=$p->getAiJobRepository()->find($j['job_id']);$ok('SQL_delete_purges_AI_private_copies',$raw['applicability']==='revoked'&&$raw['input']===[]&&$raw['result']===[]&&$raw['receipts']===[]);
    echo json_encode(['status'=>'passed','passed'=>count($checks),'checks'=>$checks,'real_llm_calls'=>0],JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR).PHP_EOL;
}catch(Throwable $error){fwrite(STDERR,json_encode(['status'=>'failed','type'=>get_class($error),'code'=>$error instanceof ProfileException?$error->errorCode:null,'message'=>$error->getMessage(),'line'=>$error->getLine(),'file'=>basename($error->getFile()),'passed'=>count($checks)],JSON_THROW_ON_ERROR).PHP_EOL);exit(1);}
