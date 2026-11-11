<?php
declare(strict_types=1);
namespace humhub\modules\matcherOnboarding\application;

use humhub\modules\matcherOnboarding\domain\ports\OnboardingRepository;
use humhub\modules\matcherProfile\domain\ports\ProfileAiWorkflow;
use humhub\modules\matcherProfile\domain\ports\ProfileWorkflow;
use humhub\modules\matcherProfile\domain\ports\ProfileSourceRepository;
use humhub\modules\matcherProfile\domain\ports\QuestionRepository;
use humhub\modules\matcherProfile\application\QuestionService;
use humhub\modules\matcherProfile\domain\FieldCatalog;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\rules\RuleQuestionProvider;

/** AI results join the existing owner flow through versioned, transactional references. */
final class OnboardingAiWorkflow implements ProfileAiWorkflow
{
    public function __construct(private ProfileWorkflow $profiles, private OnboardingRepository $sessions, private QuestionRepository $questions, private ProfileSourceRepository $sources) {}
    public function transaction(int $ownerId,?int $spaceId,callable $callback,bool $writable=true): mixed
    { return $this->profiles->transaction($ownerId,$spaceId,fn()=>$this->sessions->transaction(fn()=>$this->questions->transaction(fn()=>$this->sources->transaction($callback))),$writable); }
    public function capture(int $ownerId,string $operation,array $request): array
    {
        $allowed=match($operation){'extract'=>['session_id','expected_version','sources'],'questions'=>['session_id','expected_version'],'compose'=>['session_id','expected_version','expected_batch_version'],default=>[]};
        if(array_diff(array_keys($request),$allowed)!==[]||!is_string($request['session_id']??null)||!is_int($request['expected_version']??null))$this->invalid('Provide the session and its expected version.');
        $session=$this->owned($ownerId,$request['session_id']);
        return $this->transaction($ownerId,$session['space_id'],function()use($ownerId,$operation,$request):array {
            $session=$this->owned($ownerId,$request['session_id'],true);
            if($session['status']!=='active'||$session['version']!==$request['expected_version'])throw new ProfileException('ONBOARDING_VERSION_CONFLICT','Reload the active session before requesting AI.',409);
            $profiles=$this->profiles->profiles($ownerId,$session['space_id']);
            if(!QuestionService::sameVersions(QuestionService::versions($profiles),$session['resource_refs']['profile_versions']))throw new ProfileException('PROFILE_VERSION_CONFLICT','Reconcile the current confirmed profile first.',409);
            $context=$this->context($session,$profiles);$input=['profiles'=>$profiles,'space_id'=>$session['space_id']];
            if($operation==='extract'){
                if(!in_array($session['stage'],['materials','review'],true))$this->invalid('Open materials review before extracting new material.');
                [$selected,$refs]=$this->selectedSources($ownerId,$request['sources']??null);$context['sources']=$refs;$input=['sources'=>$selected,'space_id'=>$session['space_id']];
                $draft=$this->profiles->getDraft($ownerId,null,$session['resource_refs']['input_drafts']['global']);
                if($draft['status']!=='editing')$this->invalid('Open a fresh editable materials draft before extraction.');
            }else{
                if(!$session['resource_refs']['review_confirmed'])$this->invalid('Confirm the material review before requesting questions or a profile.');
                if($operation==='questions'){
                    if($session['stage']!=='questions'||$session['resource_refs']['question_batch_id']!==null)throw new ProfileException('AI_QUESTION_BATCH_EXISTS','Use the saved question batch or explicitly reconcile before creating another.',409);
                }else{
                    if(!in_array($session['stage'],['questions','draft','privacy'],true))$this->invalid('Open the questions or generated profile first.');
                    $batchId=$session['resource_refs']['question_batch_id'];$batch=$batchId===null?null:$this->questions->findBatch($batchId,true);
                    if(!$batch||!is_int($request['expected_batch_version']??null)||$batch['version']!==$request['expected_batch_version'])throw new ProfileException('BATCH_VERSION_CONFLICT','Answer the current saved batch first.',409);
                    $answers=$this->questions->answers($batchId);$byId=array_column($answers,null,'question_id');
                    foreach($batch['questions'] as $q)if(!isset($byId[$q['id']]))throw new ProfileException('ANSWERS_INCOMPLETE','Answer or skip each saved question first.');
                    $input['questions']=$batch['questions'];$input['answers']=$answers;
                }
            }
            return ['input'=>$input,'context'=>$context];
        });
    }
    public function applicability(int $ownerId,array $context): string
    {
        try{return $this->transaction($ownerId,$context['space_id'],function()use($ownerId,$context):string {
            foreach($context['sources']??[] as $id=>$ref){$source=$this->sources->findSource($id,true);if(!$source||$source['owner_id']!==$ownerId||$source['status']==='deleted')return 'revoked';if($source['status']!=='ready'||$source['version']!==$ref['version']||$source['latest_snapshot_id']!==$ref['snapshot_id'])return 'superseded';}
            $session=$this->sessions->findSession($context['session_id'],true);if(!$session||$session['owner_id']!==$ownerId)return 'revoked';
            if($session['status']!=='active'||$session['version']!==$context['session_version'])return 'superseded';
            $current=$this->context($session,$this->profiles->profiles($ownerId,$context['space_id']));
            foreach(['profiles_hash','drafts','batch'] as $key)if(self::hash($current[$key])!==self::hash($context[$key]))return 'superseded';
            return 'current';
        },false);}catch(ProfileException $e){return $e->errorCode==='PROFILE_ACCESS_DENIED'?'revoked':'superseded';}
    }
    public function install(int $ownerId,string $operation,array $context,array $data): array
    {
        return $this->transaction($ownerId,$context['space_id'],function()use($ownerId,$operation,$context,$data):array {
            if($this->applicability($ownerId,$context)!=='current')throw new ProfileException('AI_RESULT_NOT_APPLICABLE','This task no longer matches the current inputs.',409);
            if(!is_array($data['review_items']??null)||!array_is_list($data['review_items']))$this->invalid('AI review items are invalid.');
            if($operation==='extract')return ['result'=>$data,'context'=>$context];
            $session=$this->owned($ownerId,$context['session_id'],true);$profiles=$this->profiles->profiles($ownerId,$context['space_id']);$now=gmdate('Y-m-d H:i:s');
            if($operation==='questions'){
                $questions=$this->validatedQuestions($profiles,$context['space_id'],$data['questions']??null);
                $batch=['id'=>QuestionService::uuid(),'owner_id'=>$ownerId,'space_id'=>$context['space_id'],'profile_versions'=>QuestionService::versions($profiles),'version'=>1,'questions'=>$questions,'generation_mode'=>'ai','schema_version'=>1,'policy_version'=>self::profileHash($profiles),'ai_metadata'=>['metrics'=>$context['metrics']??[],'review_items'=>$data['review_items']],'created_at'=>$now,'updated_at'=>$now];
                $this->questions->saveBatch($batch);$session['resource_refs']['question_batch_id']=$batch['id'];$session['resource_refs']['batch_request_version']=$session['version'];$session['resource_refs']['question_index']=0;
                $data['question_batch_id']=$batch['id'];$data['batch_version']=1;
            }else{
                $drafts=['global'=>null,'space'=>null];
                foreach($this->scopes($session) as $scope=>$space){
                    $id=$session['resource_refs']['output_drafts'][$scope];
                    $prior=$id===null?null:$this->profiles->getDraft($ownerId,$space,$id);
                    // An existing editable draft, including hand edits, is the authoritative preview.
                    $draft=$prior!==null&&$prior['status']==='editing'?$prior:$this->profiles->createDraft($ownerId,$space);
                    $operations=$this->nonOverwriting($data[$scope.'_fields']??[],$draft['preview_attributes'],$scope,$profiles,$data['review_items']);
                    if($operations!==[])$draft=$this->profiles->updateDraft($ownerId,$space,$draft['id'],$draft['draft_version'],$operations);
                    $drafts[$scope]=$draft['id'];
                }
                $session['resource_refs']['output_drafts']=$drafts;$session['resource_refs']['synthesis_batch_version']=$context['batch']['version'];$session['resource_refs']['synthesis_request_version']=$session['version'];
                $session['stage']=$session['max_stage']='draft';$data['output_drafts']=$drafts;$data['batch_version']=$context['batch']['version'];
            }
            // Only references and review hints are attached; user values stay in canonical batches/drafts.
            $session['resource_refs']['ai_review_items'][$operation]=$data['review_items'];$session['resource_refs']['ai_metrics'][$operation]=$context['metrics']??[];$session['resource_refs']['generation_mode']='ai';
            ++$session['version'];$session['updated_at']=$now;$this->sessions->saveSession($session);
            $next=$this->context($session,$profiles);unset($data['questions'],$data['global_fields'],$data['space_fields']);$data['session_id']=$session['id'];$data['session_version']=$session['version'];
            return ['result'=>$data,'context'=>$next];
        });
    }
    public function applyCandidates(int $ownerId,array $context,array $data,array $request): array
    {
        if(array_diff(array_keys($request),['draft_id','expected_draft_version','candidate_ids'])!==[]||!is_string($request['draft_id']??null)||!is_int($request['expected_draft_version']??null)||!is_array($request['candidate_ids']??null)||!array_is_list($request['candidate_ids'])||$request['candidate_ids']===[]||count($request['candidate_ids'])>200||count(array_unique($request['candidate_ids'],SORT_REGULAR))!==count($request['candidate_ids']))$this->invalid('Select distinct extraction candidate IDs and the current draft.');
        return $this->transaction($ownerId,$context['space_id'],function()use($ownerId,$context,$data,$request):array {
            if($this->applicability($ownerId,$context)!=='current')throw new ProfileException('AI_RESULT_NOT_APPLICABLE','This extraction no longer matches the inputs.',409);
            $session=$this->owned($ownerId,$context['session_id'],true);
            if($request['draft_id']!==$session['resource_refs']['input_drafts']['global'])$this->invalid('Adopt candidates into the session materials draft.');
            $draft=$this->profiles->getDraft($ownerId,null,$request['draft_id']);
            if($draft['status']!=='editing'||$draft['draft_version']!==$request['expected_draft_version'])throw new ProfileException('DRAFT_VERSION_CONFLICT','Reload the edited draft before adopting candidates.',409);
            $candidates=array_column($data['candidates']??[],null,'id');$selected=[];
            foreach($request['candidate_ids'] as $id){if(!is_string($id)||!isset($candidates[$id]))$this->invalid('Select candidates from this extraction.');$selected[]=$candidates[$id];}
            $present=$draft['preview_attributes'];$fields=[];$applied=[];$skipped=[];
            foreach($selected as $candidate){$key=$candidate['key'];$def=FieldCatalog::get($key);if($def['scope']!=='global'||FieldCatalog::validate($key,$candidate['value'],false)!==[])$this->invalid('Invalid extraction candidate.');$reason=null;
                foreach($present as $item){if($item['key']!==$key)continue;if(self::hash($item['value'])===self::hash($candidate['value'])){$reason='same_value';break;}if($def['cardinality']==='one'){$reason='existing_value';break;}}
                if($reason!==null){$skipped[]=['candidate_id'=>$candidate['id'],'reason'=>$reason];continue;}
                $field=['key'=>$key,'value'=>$candidate['value'],'visibility'=>'authenticated'];$fields[]=$field;$present[]=$field;$applied[]=$candidate['id'];
            }
            if($fields!==[])$draft=$this->profiles->updateDraft($ownerId,null,$draft['id'],$draft['draft_version'],$fields);
            $next=$this->context($session,$this->profiles->profiles($ownerId,$context['space_id']));$next['sources']=$context['sources'];
            return ['context'=>$next,'result'=>['draft'=>$draft,'applied'=>$applied,'skipped'=>$skipped]];
        });
    }
    private function selectedSources(int $ownerId,mixed $selections): array
    {
        if(!is_array($selections)||!array_is_list($selections)||count($selections)<1||count($selections)>5)$this->invalid('Select between one and five current sources.');
        $sources=[];$refs=[];$bytes=0;$count=0;
        foreach($selections as $selection){
            if(!is_array($selection)||array_diff(array_keys($selection),['source_id','expected_version','section_ids'])!==[]||!is_string($selection['source_id']??null)||!is_int($selection['expected_version']??null)||isset($refs[$selection['source_id']]))$this->invalid('Provide distinct sources and current versions.');
            $source=$this->sources->findSource($selection['source_id'],true);
            if(!$source||$source['owner_id']!==$ownerId||$source['status']==='deleted')throw new ProfileException('SOURCE_NOT_FOUND','This source was not found.',404);
            if($source['status']!=='ready'||$source['version']!==$selection['expected_version'])throw new ProfileException('SOURCE_VERSION_CONFLICT','Select the current successful source version.',409);
            $snapshot=$this->sources->findSnapshot($source['latest_snapshot_id']);$all=array_column($snapshot['content']['sections'],null,'id');$ids=$selection['section_ids']??array_keys($all);
            if(!is_array($ids)||!array_is_list($ids)||$ids===[]||count($ids)>200||count(array_unique($ids,SORT_REGULAR))!==count($ids))$this->invalid('Choose distinct source sections.');
            $sections=[];foreach($ids as $id){if(!is_string($id)||!isset($all[$id]))$this->invalid('A selected section does not belong to this source.');$section=['id'=>$id,'text'=>$all[$id]['text']];$sections[]=$section;$bytes+=strlen($section['text']);++$count;}
            $sources[]=['source_id'=>$source['id'],'version'=>$source['version'],'sections'=>$sections];$refs[$source['id']]=['version'=>$source['version'],'snapshot_id'=>$source['latest_snapshot_id'],'section_ids'=>$ids];
        }
        if($bytes>65536||$count>200)throw new ProfileException('AI_INPUT_TOO_LARGE','Select at most 200 sections and 64 KiB of source text.',413);
        return [$sources,$refs];
    }
    private function context(array $session,array $profiles): array
    {
        $drafts=[];foreach(['input_drafts','output_drafts'] as $kind)foreach($this->scopes($session) as $scope=>$space){$id=$session['resource_refs'][$kind][$scope];if($id===null){$drafts[$kind][$scope]=null;continue;}$draft=$this->profiles->getDraft($session['owner_id'],$space,$id);$drafts[$kind][$scope]=['id'=>$id,'version'=>$draft['draft_version'],'status'=>$draft['status'],'base_revision'=>$draft['base_revision']];}
        $batchId=$session['resource_refs']['question_batch_id'];$batch=$batchId===null?null:$this->questions->findBatch($batchId,true);
        return ['session_id'=>$session['id'],'session_version'=>$session['version'],'space_id'=>$session['space_id'],'profiles_hash'=>self::profileHash($profiles),'drafts'=>$drafts,'batch'=>$batch===null?null:['id'=>$batch['id'],'version'=>$batch['version']],'sources'=>[]];
    }
    private function validatedQuestions(array $profiles,?int $spaceId,mixed $questions): array
    {
        if(!is_array($questions)||!array_is_list($questions)||count($questions)<3||count($questions)>8)$this->invalid('AI must provide three to eight valid questions.');
        $templates=array_column((new RuleQuestionProvider())->questions($profiles,$spaceId),null,'id');$seen=[];
        foreach($questions as $q){if(!is_array($q)||!is_string($q['id']??null)||isset($seen[$q['id']])||!isset($templates[$q['id']]))$this->invalid('AI question identifiers must match allowed templates.');$template=$templates[$q['id']];foreach(['template_id','target_key','scope','mode','options','allow_free_text','allow_skip'] as $key)if(self::hash($q[$key]??null)!==self::hash($template[$key]))$this->invalid('AI cannot change question fields or saved option codes.');if(($q['free_text_option']['code']??null)!=='other'||($q['free_text_option']['position']??null)!=='last')$this->invalid('Every AI question needs the final free answer control.');$seen[$q['id']]=true;}
        return $questions;
    }
    private function nonOverwriting(array $fields,array $present,string $scope,array $profiles,array &$reviewItems): array
    {
        if(!array_is_list($fields)||count($fields)>200)$this->invalid('AI fields must be a bounded list.');$out=[];
        foreach($fields as $field){$key=$field['key']??null;if(!is_string($key))$this->invalid('AI field key is invalid.');$definition=FieldCatalog::get($key);if($definition['scope']!==($scope==='space'?'event':'global')||FieldCatalog::validate($key,$field['value']??null,false)!==[])$this->invalid('AI field value or scope is invalid.');$skip=false;
            foreach($present as $existing){if($existing['key']!==$key)continue;if($definition['cardinality']==='one'||self::hash($existing['value'])===self::hash($field['value'])||(is_array($existing['value'])&&is_array($field['value'])&&isset($existing['value']['code'],$field['value']['code'])&&$existing['value']['code']===$field['value']['code'])){$skip=true;if(self::hash($existing['value'])!==self::hash($field['value']))$reviewItems[]=['id'=>'retained_'.substr(self::hash([$scope,$key]),0,16),'kind'=>'conflict','message'=>'保留了当前草稿中的这一项。新回答与现有内容不同，请本人检查并按需编辑。','field_keys'=>[$key],'evidence'=>[]];break;}}
            if($skip)continue;
            $visibility=$field['visibility']??'authenticated';$rank=['authenticated'=>0,'friends'=>1,'private'=>2];if(!isset($rank[$visibility]))$this->invalid('Invalid AI visibility.');
            foreach($field['evidence']??[] as $ref){if(($ref['type']??null)!=='profile')continue;foreach($profiles[$ref['scope']]['attributes']??[] as $source)if($source['attribute_id']===$ref['attribute_id']&&$rank[$source['visibility']]>$rank[$visibility])$visibility=$source['visibility'];}
            $op=['key'=>$key,'value'=>$field['value'],'visibility'=>$visibility];$out[]=$op;$present[]=$op;
        }
        return $out;
    }
    public static function profileHash(array $profiles): string
    { return QuestionService::aiProfileHash($profiles); }
    private static function hash(mixed $value): string
    { $normalize=function($v)use(&$normalize){if(is_array($v)){if(!array_is_list($v))ksort($v);foreach($v as &$item)$item=$normalize($item);unset($item);}return $v;};return hash('sha256',json_encode($normalize($value),JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE)); }
    private function owned(int $ownerId,string $id,bool $lock=false): array
    { $s=$this->sessions->findSession($id,$lock);if(!$s||$s['owner_id']!==$ownerId)throw new ProfileException('ONBOARDING_NOT_FOUND','This onboarding session was not found.',404);return $s; }
    private function scopes(array $session): array { return $session['space_id']===null?['global'=>null]:['global'=>null,'space'=>$session['space_id']]; }
    private function invalid(string $message): never { throw new ProfileException('AI_WORKFLOW_INVALID',$message); }
}
