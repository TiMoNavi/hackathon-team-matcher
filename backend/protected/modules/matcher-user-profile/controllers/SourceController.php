<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\controllers;
use humhub\modules\matcherProfile\adapters\http\SourceJsonController;
use humhub\modules\matcherProfile\application\ProfileSourceService;
use humhub\modules\matcherProfile\domain\ProfileException;
use Yii;
use yii\web\UploadedFile;

/** Native login/CSRF boundary; paths and identity are never accepted from JSON. */
final class SourceController extends SourceJsonController
{
    public function actionCapabilities(): array { $this->method('GET');return $this->ok($this->service()->capabilities($this->actor())); }
    public function actionProgress(string $id): array { $this->method('GET');return $this->ok($this->service()->getProgress($this->actor(),$this->uuid($id))); }
    public function actionSources(): array
    {
        if(Yii::$app->request->method==='GET')return $this->ok($this->service()->list($this->actor()));
        $this->method('POST');$data=$this->body(['kind','url','text','label','ownership']);$kind=$data['kind']??null;
        $allowed=match($kind){'github'=>['kind'],'web'=>['kind','url','ownership'],'text'=>['kind','text','label','ownership'],default=>throw new ProfileException('INVALID_SOURCE','Use kind github, web or text; upload resumes through the file endpoint.')};
        if(array_diff(array_keys($data),$allowed)!==[])throw new ProfileException('UNKNOWN_FIELD','The source kind does not support these fields.');
        unset($data['kind']);
        return $this->ok($this->service()->import($this->actor(),$kind,$data,$this->requestKey()),201);
    }
    public function actionResume(): array
    {
        $this->method('POST');[$input,$hash]=$this->upload([]);
        return $this->ok($this->service()->import($this->actor(),'resume',$input,$this->requestKey(),$hash),201);
    }
    public function actionSource(string $id): array
    {
        $id=$this->uuid($id);
        if(Yii::$app->request->method==='GET')return $this->ok($this->service()->get($this->actor(),$id));
        $this->method('DELETE');$data=$this->body(['expected_version']);return $this->ok($this->service()->delete($this->actor(),$id,$this->version($data)));
    }
    public function actionRefresh(string $id): array
    {
        $this->method('POST');$id=$this->uuid($id);$source=$this->service()->get($this->actor(),$id);$hash=null;$input=[];
        if($source['kind']==='resume'){
            [$input,$hash,$data]=$this->upload(['expected_version']);
            $raw=$data['expected_version']??null;if(!is_string($raw)||!preg_match('/^[1-9][0-9]{0,12}$/D',$raw))throw new ProfileException('INVALID_VERSION','Provide expected_version.');$version=(int)$raw;
        }elseif($source['kind']==='text'){
            $data=$this->body(['expected_version','text','label','ownership']);$version=$this->version($data);unset($data['expected_version']);$input=$data;
        }else{$data=$this->body(['expected_version']);$version=$this->version($data);}
        return $this->ok($this->service()->refresh($this->actor(),$id,$version,$input,$this->requestKey(),$hash));
    }
    public function actionExtractions(): array
    {
        $this->method('POST');$data=$this->body(['source_id','expected_version','draft_id','expected_draft_version','candidate_ids','generation_mode','session_id','sources']);
        $mode=$data['generation_mode']??'rules';
        if($mode==='ai'){unset($data['generation_mode']);$module=Yii::$app->getModule('matcher-onboarding');if(!$module instanceof \humhub\modules\matcherOnboarding\Module||!$module->isEnabled)throw new ProfileException('AI_UNAVAILABLE','Enable the onboarding workflow before AI extraction.',503);return $this->ok($module->getAiJobService()->submit($this->actor(),'extract',$data,$this->requestKey()),202);}
        if($mode!=='rules')throw new ProfileException('INVALID_GENERATION_MODE','Use rules or ai.');unset($data['generation_mode']);if(array_diff(array_keys($data),['source_id','expected_version','draft_id','expected_draft_version','candidate_ids'])!==[])throw new ProfileException('UNKNOWN_FIELD','Unsupported rules extraction fields.');
        return $this->ok($this->service()->apply($this->actor(),$this->uuid($data['source_id']??null),$this->version($data),$this->uuid($data['draft_id']??null),$this->version($data,'expected_draft_version'),$this->list($data,'candidate_ids'),$this->requestKey()));
    }
    private function upload(array $allowed): array
    {
        $request=Yii::$app->request;if(!str_starts_with(strtolower((string)$request->headers->get('Content-Type')),'multipart/form-data;'))throw new ProfileException('UNSUPPORTED_MEDIA_TYPE','Upload one file with multipart/form-data.',415);
        $data=$request->post();unset($data[$request->csrfParam]);
        if(array_diff(array_keys($data),$allowed)!==[]||array_diff(array_keys($_FILES),['file'])!==[])throw new ProfileException('UNKNOWN_FIELD','The upload contains unsupported fields.');
        $files=UploadedFile::getInstancesByName('file');$file=UploadedFile::getInstanceByName('file');
        if($file===null||count($files)!==1||$file->error!==UPLOAD_ERR_OK||!is_uploaded_file($file->tempName))throw new ProfileException('UPLOAD_FAILED','Upload one valid resume file.',400);
        if($file->size<1||$file->size>5242880||filesize($file->tempName)!==$file->size)throw new ProfileException('UPLOAD_TOO_LARGE','The resume must be between 1 byte and 5 MiB.',413);
        $input=['tmp_path'=>$file->tempName,'filename'=>$file->name,'mime'=>$file->type,'size'=>$file->size];
        return [$input,hash_file('sha256',$file->tempName),$data];
    }
    private function requestKey(): string { $key=Yii::$app->request->headers->get('Idempotency-Key');return is_string($key)?$key:''; }
    private function service(): ProfileSourceService { return $this->module->getSourceService(); }
}
