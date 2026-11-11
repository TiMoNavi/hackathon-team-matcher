<?php
declare(strict_types=1);
/** Synthetic-only engine for independent HTTP/SQL tests. No gateway or configuration file. */
use humhub\modules\matcherProfile\domain\ports\ProfileAiEngine;
use humhub\modules\matcherProfile\domain\ProfileAiFailure;
use humhub\modules\matcherProfile\domain\FieldCatalog;
use humhub\modules\matcherProfile\domain\rules\RuleQuestionProvider;
use humhub\modules\matcherProfile\domain\rules\RulesProfileComposer;
use humhub\modules\matcherOnboardingAi\domain\OutputValidator;

final class S77AuditTransport implements \humhub\modules\matcherOnboardingAi\domain\ports\ModelTransport
{
    public function __construct(private object $app, private string $mode='success'){}
    public function available():bool{return true;}
    public function request(\humhub\modules\matcherOnboardingAi\domain\GatewayConfig $config,array $payload):array
    {
        $request=json_decode($payload['messages'][1]['content'],true,512,JSON_THROW_ON_ERROR);
        $operation=$request['operation'];$input=$request['input_data'];
        $active=$this->app->db->getTransaction()?->isActive ?? false;
        $this->journal(['operation'=>$operation,'event'=>'entered','active_transaction'=>$active,'mode'=>$this->mode]);
        if($active)throw new ProfileAiFailure('AUDIT_MODEL_INSIDE_TRANSACTION');
        if($this->mode==='delay')usleep(3000000);
        if($this->mode==='fail')throw new \humhub\modules\matcherOnboardingAi\domain\TransportFailure('AI_TIMEOUT');
        if($this->mode==='unknown')throw new RuntimeException('AUDIT_PRIVATE_ENGINE_FAILURE');
        $prepared=$input;
        if($operation==='extract'){
            $candidates=[];
            foreach([['city','杭州'],['skill',['code'=>'python','label'=>'Python']],['contact_email','s77_audit@example.invalid']] as [$key,$value]){
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
        if($this->mode==='invalid')$data=['confirmed'=>true,'candidates'=>[],'review_items'=>[]];
        $this->journal(['operation'=>$operation,'event'=>'completed','active_transaction'=>false,'mode'=>$this->mode]);
        return ['status'=>200,'body'=>json_encode(['model'=>$config->model(),'choices'=>[['finish_reason'=>'stop','message'=>['role'=>'assistant','content'=>json_encode($data,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE)]]],'usage'=>['prompt_tokens'=>10,'completion_tokens'=>20,'total_tokens'=>30]],JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE)];
    }
    private function journal(array $row):void{file_put_contents($this->app->runtimePath.'/s77_audit-ai-journal.jsonl',json_encode($row,JSON_THROW_ON_ERROR).PHP_EOL,FILE_APPEND|LOCK_EX);}
}
function s77AuditInject(object $app,string $mode='success'):void
{
    $name=$app->db->createCommand('SELECT DATABASE()')->queryScalar();
    if($name!=='humhub_profile_s77_test_audit_a8c52e14')throw new RuntimeException('S77 audit exact database required.');
    $module=$app->getModule('matcher-onboarding-ai');
    if($module!==null&&$module->isEnabled)$module->setAiEngine(new \humhub\modules\matcherOnboardingAi\application\StructuredProfileAiEngine(new \humhub\modules\matcherOnboardingAi\domain\GatewayConfig('https://s77-synthetic.invalid/v1','s77-audit-synthetic','s77-synthetic-never-live'),new S77AuditTransport($app,$mode)));
    $onboarding=$app->getModule('matcher-onboarding');
    if($onboarding!==null&&$onboarding->isEnabled)$onboarding->aiTaskLimits=['active_jobs'=>10,'daily_jobs'=>1000,'attempts'=>3];
}

/** No network reader; source state is persisted before this hook runs. */
final class S77AuditReader implements \humhub\modules\matcherProfile\domain\ports\IdentifiedProfileSourceReader
{
    public function __construct(private object $app,private string $mode='success'){}
    public function kind():string{return 'text';}
    public function status(int $ownerId):array{return ['available'=>true,'kind'=>'text'];}
    public function identify(int $ownerId,array $input):array{return ['external_id'=>'text:'.hash('sha256',$input['text']),'label'=>'S77 audit synthetic source','canonical_url'=>null,'ownership_basis'=>'self_declared'];}
    public function read(int $ownerId,array $input):array
    {
        $active=$this->app->db->getTransaction()?->isActive??false;
        file_put_contents($this->app->runtimePath.'/s77_audit-reader-journal.jsonl',json_encode(['event'=>'entered','active_transaction'=>$active,'mode'=>$this->mode],JSON_THROW_ON_ERROR).PHP_EOL,FILE_APPEND|LOCK_EX);
        if($active)throw new RuntimeException('S77 audit reader ran in transaction.');
        if($this->mode==='delay')usleep(1500000);
        if($this->mode==='fail')throw new \humhub\modules\matcherProfile\domain\ProfileException('SOURCE_READ_FAILED','S77_AUDIT_PRIVATE_SOURCE_DIAGNOSTIC',502);
        $identity=$this->identify($ownerId,$input);unset($identity['ownership_basis']);
        return $identity+['raw_text'=>$input['text'],'sections'=>[['id'=>'s77_audit_section','label'=>'synthetic','text'=>$input['text'],'locator'=>[]]],'candidates'=>[],'metadata'=>[]];
    }
}
