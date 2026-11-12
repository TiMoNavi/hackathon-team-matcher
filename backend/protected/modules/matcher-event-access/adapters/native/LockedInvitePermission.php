<?php
declare(strict_types=1);
namespace humhub\modules\matcherEventAccess\adapters\native;
use humhub\libs\BasePermission;
use humhub\modules\space\models\Space;
use humhub\modules\space\permissions\InviteUsers;
use humhub\modules\content\models\{ContentContainerPermission,ContentContainerDefaultPermission};
use humhub\modules\matcherEventAccess\domain\EventAccessException as Failure;
use yii\db\{Connection,Query};
/** Native precedence without PermissionManager's runtime/default caches or repeatable-read snapshots. */
final class LockedInvitePermission
{
    public function __construct(private Connection $db){}
    public function allowed(int $containerId,string $group): bool
    {
        $permission=new InviteUsers();
        $where=['group_id'=>$group,'module_id'=>$permission->getModuleId(),'permission_id'=>$permission->getId()];
        $override=$this->current(ContentContainerPermission::tableName(),['contentcontainer_id'=>$containerId]+$where);
        $default=$this->current(ContentContainerDefaultPermission::tableName(),['contentcontainer_class'=>Space::class]+$where);
        $state=$override['state']??$default['state']??$permission->getDefaultState($group);
        return (int)$state===BasePermission::STATE_ALLOW;
    }
    private function current(string $table,array $where): ?array
    {
        if(!$this->db->getTransaction()?->isActive)throw new Failure('DEPENDENCY_UNAVAILABLE','Invite permission requires a locked transaction.',503);
        [$sql,$params]=$this->db->getQueryBuilder()->build((new Query())->from($table)->where($where));
        if($this->db->driverName!=='sqlite')$sql.=' FOR UPDATE';
        $command=$this->db->createCommand($sql,$params)->noCache();
        $rows=$command->queryAll();if(count($rows)>1)throw new Failure('DEPENDENCY_UNAVAILABLE','Ambiguous native invitation permission.',503);return $rows[0]??null;
    }
}
