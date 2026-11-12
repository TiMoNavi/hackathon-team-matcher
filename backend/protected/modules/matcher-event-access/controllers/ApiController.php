<?php
declare(strict_types=1);
namespace humhub\modules\matcherEventAccess\controllers;
use humhub\modules\matcherEventAccess\domain\{EventAccessException as Failure,EventCursor};
use humhub\modules\matcherEventAccess\adapters\http\RequestBoundary;
use humhub\modules\user\models\User;
use yii\web\{Controller,HttpException,Response};
use Yii;
final class ApiController extends Controller
{
    public $enableCsrfValidation=true;
    private string $requestId;
    public function runAction($id,$params=[])
    {
        $this->requestId=bin2hex(random_bytes(12));Yii::$app->response->format=Response::FORMAT_JSON;
        Yii::$app->response->headers->set('Cache-Control','private, no-store');Yii::$app->response->headers->set('X-Content-Type-Options','nosniff');
        RequestBoundary::prepare(Yii::$app->request);
        try{return parent::runAction($id,$params);}
        catch(Failure $e){return $this->error($e->httpStatus,$e->errorCode,$e->getMessage());}
        catch(HttpException $e){return $this->error($e->statusCode,'INVALID_REQUEST','The request or CSRF token is invalid.');}
        catch(\Throwable){return $this->error(503,'DEPENDENCY_UNAVAILABLE','Activity access is temporarily unavailable.');}
    }
    public function beforeAction($action){$this->actor();return parent::beforeAction($action);}
    public function actionJoined(): array
    {
        $this->method('GET');$query=$this->query(['limit','cursor']);$limit=24;
        if(isset($query['limit'])){if(!is_string($query['limit'])||!preg_match('/^[1-9][0-9]?$/D',$query['limit']))$this->invalid();$limit=(int)$query['limit'];}
        if($limit>48)$this->invalid();$actor=$this->actor();$cursor=new EventCursor((string)Yii::$app->request->cookieValidationKey);$after=0;
        if(isset($query['cursor'])){if(!is_string($query['cursor']))$this->invalid();$after=$cursor->decode($query['cursor'],$actor,$limit,time());}
        $page=$this->module->service()->joined($actor,$after,$limit);$last=$page['items']===[]?null:$page['items'][array_key_last($page['items'])];
        return $this->ok(['items'=>$page['items'],'next_cursor'=>$page['has_more']&&$last!==null?$cursor->encode($actor,$limit,$last['space_id'],time()):null,'has_more'=>$page['has_more'],'limit'=>$limit]);
    }
    public function actionCreate(string $spaceId): array
    {
        $this->method('POST');$this->query([]);$b=$this->body(['expires_at','max_uses','confirmation_intent']);
        if(!preg_match('/^[1-9][0-9]*$/D',$spaceId)||filter_var($spaceId,FILTER_VALIDATE_INT)===false||!is_string($b['expires_at']??null)||!is_int($b['max_uses']??null)||!is_string($b['confirmation_intent']??null))$this->invalid();
        $result=$this->module->service()->create($this->actor(),(int)$spaceId,$b['expires_at'],$b['max_uses'],$this->key(),$b['confirmation_intent']);return $this->ok($result,$result['token_revealed']?201:200);
    }
    public function actionRevoke(string $id): array
    {
        $this->method('POST');$this->query([]);$b=$this->body(['expected_version','confirmation_intent']);
        if(!is_int($b['expected_version']??null)||!is_string($b['confirmation_intent']??null))$this->invalid();
        return $this->ok($this->module->service()->revoke($this->actor(),$id,$b['expected_version'],$b['confirmation_intent']));
    }
    public function actionRedeem(): array
    {
        $this->method('POST');$this->query([]);$b=$this->body(['token','confirmation_intent']);if(!is_string($b['token']??null)||!is_string($b['confirmation_intent']??null))$this->invalid();
        $actor=$this->actor();
        try{$result=$this->module->service()->redeem($actor,$b['token'],$b['confirmation_intent'],$this->key());}
        catch(\Throwable $e){$this->module->lifecycle()->clearAfterFailure($actor);throw $e;}
        // The membership receipt is durable already. Side effects have separately inspectable outbox status.
        try{$this->module->lifecycle()->flush($actor);}catch(\Throwable){Yii::warning(['request_id'=>$this->requestId,'code'=>'EVENT_OUTBOX_PENDING'],'matcher-event-access');}
        return $this->ok($result);
    }
    public function actionReceipt(string $id): array
    { $this->method('GET');$this->query([]);return $this->ok($this->module->service()->receipt($this->actor(),$id)); }
    private function actor(): int
    { if(Yii::$app->user->isGuest)throw new Failure('AUTHENTICATION_REQUIRED','Sign in to continue.',401);$user=Yii::$app->user->identity;if(!$user instanceof User||(int)$user->status!==User::STATUS_ENABLED)throw new Failure('ACCESS_DENIED','This account is unavailable.',403);return (int)$user->id; }
    private function body(array $allowed): array
    {
        $r=Yii::$app->request;if(strtolower(trim(explode(';',(string)$r->headers->get('Content-Type'))[0]))!=='application/json')throw new Failure('UNSUPPORTED_MEDIA_TYPE','Use application/json.',415);
        if(strlen($r->rawBody)>8192)throw new Failure('REQUEST_TOO_LARGE','The request exceeds 8 KiB.',413);
        try{$object=json_decode($r->rawBody,false,8,JSON_THROW_ON_ERROR);}catch(\Throwable){$this->invalid();}
        if(!$object instanceof \stdClass)$this->invalid();$data=(array)$object;if(array_diff(array_keys($data),$allowed)||array_diff($allowed,array_keys($data)))$this->invalid();return $data;
    }
    private function query(array $allowed): array
    { $data=[];parse_str((string)Yii::$app->request->getQueryString(),$data);if(array_diff(array_keys($data),$allowed))$this->invalid();return $data; }
    private function key(): string{$key=Yii::$app->request->headers->get('Idempotency-Key');return is_string($key)?$key:'';}
    private function method(string $method): void{if(Yii::$app->request->method!==$method){Yii::$app->response->headers->set('Allow',$method);throw new Failure('METHOD_NOT_ALLOWED','Unsupported request method.',405);}}
    private function ok(array $data,int $status=200): array{Yii::$app->response->statusCode=$status;return ['data'=>$data,'meta'=>['request_id'=>$this->requestId]];}
    private function error(int $status,string $code,string $message): array{Yii::$app->response->statusCode=$status;return ['error'=>['code'=>$code,'message'=>$message,'retryable'=>$status>=500,'details'=>new \stdClass()],'meta'=>['request_id'=>$this->requestId]];}
    private function invalid(): never{throw new Failure('INVALID_REQUEST','Provide only the documented fields and types.');}
}
