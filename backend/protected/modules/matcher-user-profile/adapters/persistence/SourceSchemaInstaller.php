<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\persistence;
use yii\db\Connection;
final class SourceSchemaInstaller
{
    public function __construct(private Connection $db) {}
    public function install(): array
    {
        $ddl=new WorkflowSchemaSupport($this->db);
        return $ddl->install('sources',function()use($ddl):array {
            $uuid='char(36) CHARACTER SET ascii COLLATE ascii_bin';$user=$ddl->nativeKey('user');
            $source='matcher_profile_source';$snapshot='matcher_profile_source_snapshot';$job='matcher_profile_source_job';
            $ddl->table($source,[
                'id'=>"$uuid NOT NULL",'owner_id'=>"$user NOT NULL",'kind'=>'varchar(16) NOT NULL','source_key'=>'char(64) NOT NULL',
                'version'=>'bigint NOT NULL','status'=>'varchar(16) NOT NULL','label'=>'varchar(255) NOT NULL','external_id'=>'varchar(255) NULL',
                'canonical_url'=>'text NULL','latest_snapshot_id'=>"$uuid NULL",'last_job_id'=>"$uuid NULL",'created_at'=>'datetime(6) NOT NULL','updated_at'=>'datetime(6) NOT NULL','deleted_at'=>'datetime(6) NULL','PRIMARY KEY (id)',
            ]);
            $ddl->table($snapshot,[
                'id'=>"$uuid NOT NULL",'source_id'=>"$uuid NOT NULL",'version'=>'bigint NOT NULL','content_json'=>'json NOT NULL','created_at'=>'datetime(6) NOT NULL','PRIMARY KEY (id)',
            ]);
            $ddl->table($job,[
                'id'=>"$uuid NOT NULL",'source_id'=>"$uuid NOT NULL",'owner_id'=>"$user NOT NULL",'source_version'=>'bigint NOT NULL','operation'=>'varchar(16) NOT NULL',
                'request_hash'=>'char(64) NOT NULL','execution_status'=>'varchar(16) NOT NULL','applicability'=>'varchar(16) NOT NULL','error_code'=>'varchar(96) NULL','result_json'=>'json NOT NULL',
                'created_at'=>'datetime(6) NOT NULL','updated_at'=>'datetime(6) NOT NULL','PRIMARY KEY (id)',
            ]);
            $ddl->index($source,'source_owner_key',['owner_id','kind','source_key'],true);
            $ddl->index($source,'source_owner_created',['owner_id','created_at','id']);
            $ddl->index($snapshot,'source_snapshot_version',['source_id','version'],true);
            $ddl->index($job,'source_job_owner',['owner_id','source_id']);
            $ddl->foreignKey($source,'source_owner_fk','owner_id','user');
            $ddl->foreignKey($snapshot,'snapshot_source_fk','source_id',$source);
            $ddl->foreignKey($job,'source_job_source_fk','source_id',$source);
            $ddl->foreignKey($job,'source_job_owner_fk','owner_id','user');
            (new SourceKindSchemaUpgrade($this->db))->ensureWhileLocked();
            $ddl->check($source,'source_status',"status IN ('running','ready','failed','deleted') AND version >= 1");
            $ddl->check($snapshot,'snapshot_version','version >= 1');
            $ddl->check($job,'source_job_status',"execution_status IN ('queued','running','succeeded','failed','cancelled') AND applicability IN ('current','superseded','revoked')");
            return ['source_tables'=>3,'native_data_changed'=>false];
        });
    }
}
