<?php
declare(strict_types=1);
namespace humhub\modules\matcherEventAccess\adapters\native;
use humhub\modules\matcherEventAccess\domain\EventAccessException as Failure;
use yii\base\{Component,Event};
use yii\helpers\StringHelper;
/** Yii wildcard handlers run before prepended exact handlers. Unknown early hooks fail closed. */
final class LifecycleGuard
{
    public static function classEvent(string $class,string $name,bool $rejectExact=false,array $allowed=[]): void
    {
        $wildcards=(new \ReflectionProperty(Event::class,'_eventWildcards'))->getValue();
        $classes=array_merge([$class],array_values(class_parents($class)),array_values(class_implements($class)));
        foreach($wildcards as $pattern=>$handlers)if(StringHelper::matchWildcard($pattern,$name))foreach($handlers as $classPattern=>$callbacks)foreach($classes as $candidate)
            if($callbacks&&StringHelper::matchWildcard($classPattern,$candidate,['escape'=>false]))self::fail();
        if($rejectExact){$events=(new \ReflectionProperty(Event::class,'_events'))->getValue();foreach($classes as $candidate)foreach($events[$name][$candidate]??[] as $handler){$callback=$handler[0];if(!is_array($callback)||!in_array($callback,$allowed,true))self::fail();}}
    }
    public static function instanceEvent(Component $object,string $name,bool $exactToo): void
    {
        $object->getBehaviors();$wildcards=(new \ReflectionProperty(Component::class,'_eventWildcards'))->getValue($object);
        foreach($wildcards as $pattern=>$handlers)if($handlers&&StringHelper::matchWildcard($pattern,$name))self::fail();
        if($exactToo){$handlers=(new \ReflectionProperty(Component::class,'_events'))->getValue($object);if(!empty($handlers[$name]))self::fail();}
    }
    private static function fail(): never{throw new Failure('NATIVE_LIFECYCLE_UNSUPPORTED','Unreviewed native lifecycle hooks prevent atomic invitation acceptance.',503);}
}
