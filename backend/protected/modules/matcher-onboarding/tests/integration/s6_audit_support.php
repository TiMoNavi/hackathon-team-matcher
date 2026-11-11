<?php
declare(strict_types=1);
/** Synthetic-only engine for independent HTTP/SQL tests. No gateway or configuration file. */
use humhub\modules\matcherProfile\domain\ports\ProfileAiEngine;
use humhub\modules\matcherProfile\domain\ProfileAiFailure;
use humhub\modules\matcherProfile\domain\FieldCatalog;
use humhub\modules\matcherProfile\domain\rules\RuleQuestionProvider;
use humhub\modules\matcherProfile\domain\rules\RulesProfileComposer;
use humhub\modules\matcherOnboardingAi\domain\OutputValidator;

final class S6IndependentAuditEngine implements ProfileAiEngine
{
    public function __construct(private object $app, private string $mode='success'){}
    public function status():array{return ['available'=>true,'configured'=>true,'model'=>'s6-independent-synthetic','generation_mode'=>'ai','operations'=>['extract','questions','compose']];}
    public function generate(string $operation,array $input):array
    {
        $active=$this->app->db->getTransaction()?->isActive ?? false;
        $this->journal(['operation'=>$operation,'event'=>'entered','active_transaction'=>$active,'mode'=>$this->mode]);
        if($active)throw new ProfileAiFailure('AUDIT_MODEL_INSIDE_TRANSACTION');
        if($this->mode==='delay')usleep(1500000);
        $metrics=['model'=>'s6-independent-synthetic','llm_calls'=>1,'duration_ms'=>$this->mode==='delay'?1500:1,'usage'=>['prompt_tokens'=>10,'completion_tokens'=>20,'total_tokens'=>30,'reported'=>true]];
        if($this->mode==='fail')throw new ProfileAiFailure('AI_TIMEOUT',$metrics);
        if($this->mode==='unknown')throw new RuntimeException('AUDIT_PRIVATE_ENGINE_FAILURE');
        $validator=new OutputValidator();$prepared=$validator->prepare($operation,$input);
        if($operation==='extract'){
            $candidates=[];
            foreach([['city','杭州'],['skill',['code'=>'python','label'=>'Python']],['contact_email','audit-private@example.invalid']] as [$key,$value]){
                $needle=is_array($value)?$value['label']:$value;$ref=null;
                foreach($prepared['sources'] as $source)foreach($source['sections'] as $section)if(mb_stripos($section['text'],$needle)!==false){$ref=['source_id'=>$source['source_id'],'source_version'=>$source['version'],'section_id'=>$section['id']];break 2;}
                if($ref!==null)$candidates[]=['id'=>'audit_'.$key,'key'=>$key,'value'=>$value,'evidence'=>[$ref]];
            }
            $data=['candidates'=>$candidates,'review_items'=>[['id'=>'audit_extract_review','kind'=>'uncertain','message'=>'请本人核对合成资料后逐项采纳。','field_keys'=>['city'],'evidence'=>[]]]];
        }elseif($operation==='questions'){
            $questions=(new RuleQuestionProvider())->questions($prepared['profiles'],$prepared['space_id']);
            foreach($questions as &$question)$question['free_text_option']=OutputValidator::FREE_TEXT_OPTION;unset($question);
            $data=['questions'=>$questions,'review_items'=>[['id'=>'audit_questions_review','kind'=>'missing','message'=>'可以选择最接近的选项，也可以自由填写或跳过。','field_keys'=>[],'evidence'=>[]]]];
        }else{
            $mapped=(new RulesProfileComposer())->compose($prepared['profiles'],$prepared['questions'],$prepared['answers']);$data=['global_fields'=>[],'space_fields'=>[],'review_items'=>[['id'=>'audit_compose_review','kind'=>'uncertain','message'=>'请本人编辑画像并再次确认展示范围。','field_keys'=>[],'evidence'=>[]]]];
            $answers=array_column($prepared['answers'],null,'question_id');
            foreach(['global','space'] as $scope)foreach($mapped[$scope.'_fields'] as $item){
                $existing=false;
                foreach($prepared['profiles'][$scope]['attributes'] as $attribute)if($attribute['key']===$item['key']&&(FieldCatalog::get($item['key'])['cardinality']==='one'||$attribute['value']===$item['value'])){$existing=true;break;}
                if($existing)continue;$refs=[];
                foreach($prepared['questions'] as $question)if($question['scope']===$scope&&$answers[$question['id']]['answer_type']!=='skipped'&&($question['target_key']===$item['key']||($item['key']==='headline'&&in_array($question['target_key'],['role','interest'],true))))$refs[]=['type'=>'answer','question_id'=>$question['id']];
                if($refs===[])continue;
                $data[$scope.'_fields'][]=['key'=>$item['key'],'value'=>$item['value'],'visibility'=>$item['visibility'],'evidence'=>$refs];
            }
        }
        $data=$validator->validate($operation,$data,$input);
        $this->journal(['operation'=>$operation,'event'=>'completed','active_transaction'=>false,'mode'=>$this->mode]);
        return ['data'=>$data,'metrics'=>$metrics];
    }
    private function journal(array $row):void{file_put_contents($this->app->runtimePath.'/independent-ai-journal.jsonl',json_encode($row,JSON_THROW_ON_ERROR).PHP_EOL,FILE_APPEND|LOCK_EX);}
}
function s6IndependentInject(object $app,string $mode='success'):void
{
    $name=$app->db->createCommand('SELECT DATABASE()')->queryScalar();
    if(!is_string($name)||!str_starts_with($name,'humhub_profile_s6_test_audit_'))throw new RuntimeException('Only the dedicated audit clone is allowed.');
    $app->getModule('matcher-onboarding-ai')->setAiEngine(new S6IndependentAuditEngine($app,$mode));
}
