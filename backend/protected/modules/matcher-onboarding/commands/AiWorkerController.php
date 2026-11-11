<?php
declare(strict_types=1);
namespace humhub\modules\matcherOnboarding\commands;
use yii\console\Controller;
/** Dedicated process; output contains resource IDs/status/counts only. */
final class AiWorkerController extends Controller
{
    public int $limit = 20;
    public int $interval = 2;
    public function options($actionID): array { return array_merge(parent::options($actionID),['limit','interval']); }
    public function actionRun(): int
    {
        if($this->limit<1||$this->limit>1000){$this->stderr("Invalid task limit.\n");return 2;}
        $done=0;while($done<$this->limit){try{$job=$this->module->getAiJobService()->work();}catch(\Throwable){$this->stderr("AI worker operation failed.\n");return 1;}if($job===null)break;$this->stdout(json_encode(['job_id'=>$job['job_id'],'status'=>$job['execution_status'],'applicability'=>$job['applicability'],'llm_calls'=>$job['metrics']['llm_calls']??null,'accounting_complete'=>$job['metrics']['accounting_complete']??false],JSON_THROW_ON_ERROR)."\n");++$done;}
        if($done>0)$this->stdout(json_encode(['processed'=>$done],JSON_THROW_ON_ERROR)."\n");return 0;
    }
    public function actionWatch(): int
    {
        if($this->interval<1||$this->interval>60){$this->stderr("Invalid polling interval.\n");return 2;}
        while(true){$code=$this->actionRun();if($code!==0)return $code;sleep($this->interval);}
    }
}
