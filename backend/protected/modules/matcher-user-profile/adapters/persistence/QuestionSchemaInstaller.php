<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\adapters\persistence;

use yii\db\Connection;

/** Question records belong to ordinary profiles and remain private to their owner. */
final class QuestionSchemaInstaller
{
    public function __construct(private Connection $db) {}
    public function install(): array
    {
        $ddl = new WorkflowSchemaSupport($this->db);
        return $ddl->install('questions', function () use ($ddl): array {
            $uuid = 'char(36) CHARACTER SET ascii COLLATE ascii_bin';
            $user = $ddl->nativeKey('user'); $space = $ddl->nativeKey('space');
            $batch = 'matcher_profile_question_batch'; $answer = 'matcher_profile_question_answer';
            $ddl->table($batch, [
                'id' => "$uuid NOT NULL", 'owner_id' => "$user NOT NULL", 'space_id' => "$space NULL", 'version' => 'bigint NOT NULL',
                'profile_versions_json' => 'json NOT NULL', 'questions_json' => 'json NOT NULL',
                'generation_mode' => 'varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL', 'schema_version' => 'int NOT NULL',
                'policy_version' => 'varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL',
                'created_at' => 'datetime(6) NOT NULL', 'updated_at' => 'datetime(6) NOT NULL', 'PRIMARY KEY (id)',
            ]);
            $ddl->table($answer, [
                'id' => "$uuid NOT NULL", 'batch_id' => "$uuid NOT NULL", 'question_id' => 'varchar(96) CHARACTER SET ascii COLLATE ascii_bin NOT NULL',
                'version' => 'bigint NOT NULL', 'answer_type' => 'varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL',
                'selected_options_json' => 'json NOT NULL', 'free_text' => 'text NULL',
                'created_at' => 'datetime(6) NOT NULL', 'updated_at' => 'datetime(6) NOT NULL', 'PRIMARY KEY (id)',
            ]);
            $ddl->index($batch, 'question_owner_created', ['owner_id', 'created_at', 'id']);
            $ddl->index($batch, 'question_space', ['space_id', 'owner_id']);
            $ddl->index($answer, 'answer_question', ['batch_id', 'question_id'], true);
            $ddl->foreignKey($batch, 'question_owner_fk', 'owner_id', 'user');
            $ddl->foreignKey($batch, 'question_space_fk', 'space_id', 'space');
            $ddl->foreignKey($answer, 'answer_batch_fk', 'batch_id', $batch);
            $ddl->check($batch, 'question_version', 'version >= 0 AND schema_version >= 1');
            $ddl->check($batch, 'question_mode', "generation_mode IN ('rules','ai')");
            $ddl->check($answer, 'answer_version', 'version >= 1');
            $ddl->check($answer, 'answer_type', "answer_type IN ('options','free_text','skipped')");
            return ['question_tables' => 2, 'native_data_changed' => false];
        });
    }
}
