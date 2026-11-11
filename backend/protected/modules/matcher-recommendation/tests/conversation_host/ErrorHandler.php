<?php
declare(strict_types=1);
final class AuditErrorHandler extends yii\web\ErrorHandler {
    public function logException($exception) {
        $trace=[];foreach(array_slice($exception->getTrace(),0,8) as $row) { $trace[]=['file'=>basename($row['file']??''),'line'=>$row['line']??null,'function'=>($row['class']??'').'::'.($row['function']??'')]; }
        file_put_contents(dirname(__DIR__,5).'/.runtime/recommendation-integration-audit/errors.jsonl',json_encode(['class'=>get_class($exception),'file'=>$exception->getFile(),'line'=>$exception->getLine(),'trace'=>$trace]).PHP_EOL,FILE_APPEND|LOCK_EX);
    }
}
