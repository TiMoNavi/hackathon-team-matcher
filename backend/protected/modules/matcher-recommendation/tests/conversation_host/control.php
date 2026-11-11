<?php
declare(strict_types=1);
$app=require __DIR__.'/bootstrap.php'; require __DIR__.'/TestPorts.php';
$core=$app->getModule('matcher-recommendation'); $runtime=$core->getConversationRuntime();
use humhub\modules\matcherRecommendation\tests\conversation_host\Platform;
function budget() { global $app,$runtime; return new humhub\modules\matcherRecommendation\adapters\conversation\PdoRecommendationBudget($app->db->getMasterPdo(),new Platform(),$runtime,$runtime->identity(),new humhub\modules\matcherRecommendation\adapters\time\SystemClock()); }
$action=$argv[1]??'';
if($action==='environment') { echo json_encode(['php'=>PHP_VERSION,'mysql'=>$app->db->createCommand('SELECT VERSION()')->queryScalar(),'humhub'=>$app->version,'database'=>$app->db->createCommand('SELECT DATABASE()')->queryScalar()]); }
elseif($action==='enable') { $row=$runtime->configure($runtime->read()['revision'],true,'matcher-recommendation-ai','audit-config-v1'); echo json_encode($row); }
elseif($action==='pause') { $core->pauseConversations(); echo json_encode($runtime->read()); }
elseif($action==='allowance') { $b=budget(); echo json_encode($b->configureAllowance($b->read()['revision'],(int)$argv[2])); }
elseif($action==='reserve') { try { budget()->reserveAttempt('synthetic-race-run','respond',(string)$argv[2]); echo json_encode(['outcome'=>'reserved']); } catch(humhub\modules\matcherRecommendation\domain\ai\AiRecommendationException $e) { echo json_encode(['outcome'=>'rejected','reason'=>$e->reason]); } }
elseif($action==='counts') { echo json_encode(['conversations'=>(int)$app->db->createCommand('SELECT COUNT(*) FROM matcher_recommendation_conversation')->queryScalar(),'ledger'=>(int)$app->db->createCommand('SELECT COUNT(*) FROM '.humhub\modules\matcherRecommendation\adapters\conversation\ConversationRuntimeSchema::ATTEMPT)->queryScalar(),'migrations'=>(int)$app->db->createCommand('SELECT COUNT(*) FROM migration')->queryScalar(),'native_admin_users'=>(int)$app->db->createCommand('SELECT COUNT(*) FROM group_user gu JOIN {{%group}} g ON g.id=gu.group_id WHERE g.is_admin_group=1')->queryScalar()]); }
elseif($action==='status') { echo json_encode(['runtime'=>$runtime->read(),'budget'=>array_map('intval',$app->db->createCommand('SELECT revision,allowance,reserved FROM '.humhub\modules\matcherRecommendation\adapters\conversation\ConversationRuntimeSchema::QUOTA.' WHERE slot=1')->queryOne()),'users'=>(int)$app->db->createCommand('SELECT COUNT(*) FROM user')->queryScalar(),'queue_rows'=>(int)$app->db->createCommand('SELECT COUNT(*) FROM queue')->queryScalar()]); }
elseif($action==='revoke') { humhub\modules\matcherRecommendation\tests\conversation_host\State::revoke((int)$argv[2]); echo 'revoked'; }
elseif($action==='disable-ai') { $app->getModule('matcher-recommendation-ai')->disable(); echo 'disabled'; }
elseif($action==='enable-ai') { $app->moduleManager->getModule('matcher-recommendation-ai',false)->enable(); echo 'enabled'; }
elseif($action==='policy') {
    require_once dirname(__DIR__).'/support/autoload.php';
    $catalog=new humhub\modules\matcherRecommendation\adapters\profile\P1FieldCatalogAdapter($app->getModule('matcher-user-profile')->getFieldCatalog(...));
    $revs=new humhub\modules\matcherRecommendation\adapters\persistence\SqlPolicyRevisionStore($app->db);
    $testGov=new humhub\modules\matcherRecommendation\tests\policy\MemoryEnvironment();
    $l=new humhub\modules\matcherRecommendation\application\policy\PolicyLifecycle($revs,$catalog,$testGov,new humhub\modules\matcherRecommendation\domain\rules\DeterministicRuleEvaluator(),$testGov);
    $params=humhub\modules\matcherRecommendation\tests\live_recall\Fixtures::policy()->parameters;
    $d=$l->createDraft(1,'synthetic-audit-policy',$params); $d=$l->validate(1,$d->id,$d->revision); $d=$l->replay(1,$d->id,$d->revision); $p=$l->publish(1,$d->id,$d->revision,null);
    echo json_encode(['policy_version'=>$p->version,'real_catalog_validation'=>true,'governance_and_replay'=>'explicit test ports']);
} else { throw new RuntimeException('Unknown audit control command'); }
echo PHP_EOL;
