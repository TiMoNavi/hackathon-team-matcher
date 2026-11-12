<?php
declare(strict_types=1);
namespace humhub\modules\matcherEventAccess;
use humhub\modules\matcherEventAccess\application\EventAccessService;
use humhub\modules\matcherEventAccess\adapters\native\{NativeMembershipGateway,NativeMembershipLifecycle};
use humhub\modules\matcherEventAccess\adapters\persistence\SqlEventAccessStore;
use Yii;
final class Module extends \humhub\components\Module
{
    private ?NativeMembershipLifecycle $nativeLifecycle=null;
    public function lifecycle(): NativeMembershipLifecycle{return $this->nativeLifecycle??=new NativeMembershipLifecycle(Yii::$app->db);}
    public function service(): EventAccessService{return new EventAccessService(new SqlEventAccessStore(Yii::$app->db),new NativeMembershipGateway(Yii::$app->db,$this->lifecycle()));}
}
