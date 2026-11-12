<?php
declare(strict_types=1);
namespace humhub\modules\matcherEventAccess\domain;
final class EventCursor
{
    public function __construct(private string $key){if(strlen($key)<32)throw new EventAccessException('DEPENDENCY_UNAVAILABLE','Cursor signing is unavailable.',503);}
    public function encode(int $actor,int $limit,int $after,int $now): string
    { $body=rtrim(strtr(base64_encode(json_encode(['v'=>1,'actor'=>$actor,'limit'=>$limit,'after'=>$after,'expires'=>$now+900],JSON_THROW_ON_ERROR)),'+/','-_'),'=');return $body.'.'.hash_hmac('sha256','matcher-events-v1.'.$body,$this->key); }
    public function decode(string $cursor,int $actor,int $limit,int $now): int
    {
        if(strlen($cursor)>2048||!preg_match('/^([A-Za-z0-9_-]+)\.([a-f0-9]{64})$/D',$cursor,$m)||!hash_equals(hash_hmac('sha256','matcher-events-v1.'.$m[1],$this->key),$m[2]))$this->invalid();
        $raw=base64_decode(strtr($m[1],'-_','+/'),true);try{$data=json_decode($raw===false?'':$raw,true,8,JSON_THROW_ON_ERROR);}catch(\Throwable){$this->invalid();}
        if(!is_array($data)||array_keys($data)!==['v','actor','limit','after','expires']||$data['v']!==1||$data['actor']!==$actor||$data['limit']!==$limit||!is_int($data['after'])||$data['after']<1||!is_int($data['expires'])||$data['expires']>$now+900)$this->invalid();
        if($data['expires']<=$now)throw new EventAccessException('EVENT_CURSOR_EXPIRED','Reload your joined activities.',410);return $data['after'];
    }
    private function invalid(): never{throw new EventAccessException('EVENT_CURSOR_INVALID','This activity cursor is invalid.',409);}
}
