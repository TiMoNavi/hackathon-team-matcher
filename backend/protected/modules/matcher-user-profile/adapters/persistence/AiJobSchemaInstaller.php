<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\persistence;
use yii\db\Connection;
final class AiJobSchemaInstaller
{
    public function __construct(private Connection $db) {}
    public function install(): array
    {
        $ddl=new WorkflowSchemaSupport($this->db);
        return $ddl->install('ai_jobs',function()use($ddl):array {
            $uuid='char(36) CHARACTER SET ascii COLLATE ascii_bin';$user=$ddl->nativeKey('user');$space=$ddl->nativeKey('space');$table='matcher_profile_ai_job';
            $ddl->table($table,['id'=>"$uuid NOT NULL",'owner_id'=>"$user NOT NULL",'space_id'=>"$space NULL",'operation'=>'varchar(16) NOT NULL','request_hash'=>'char(64) NOT NULL','execution_status'=>'varchar(16) NOT NULL','applicability'=>'varchar(16) NOT NULL','error_code'=>'varchar(96) NULL','attempt'=>'int NOT NULL','retry_of'=>"$uuid NULL",'context_json'=>'json NOT NULL','input_json'=>'json NOT NULL','result_json'=>'json NOT NULL','metrics_json'=>'json NOT NULL','receipts_json'=>'json NOT NULL','created_at'=>'datetime(6) NOT NULL','updated_at'=>'datetime(6) NOT NULL','started_at'=>'datetime(6) NULL','finished_at'=>'datetime(6) NULL','PRIMARY KEY (id)']);
            $ddl->index($table,'ai_job_owner_created',['owner_id','created_at']);$ddl->index($table,'ai_job_queue',['execution_status','applicability','created_at']);
            $ddl->foreignKey($table,'ai_job_owner_fk','owner_id','user');$ddl->foreignKey($table,'ai_job_space_fk','space_id','space');
            $ddl->check($table,'ai_job_status',"execution_status IN ('queued','running','succeeded','failed','cancelled') AND applicability IN ('current','superseded','revoked') AND operation IN ('extract','questions','compose') AND attempt BETWEEN 1 AND 3");
            if($this->db->schema->getTableSchema('{{%matcher_profile_question_batch}}',true)->getColumn('ai_metadata_json')===null)$this->db->createCommand()->addColumn('{{%matcher_profile_question_batch}}','ai_metadata_json','json NULL')->execute();
            return ['ai_job_tables'=>1,'native_data_changed'=>false];
        });
    }
}
