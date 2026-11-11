<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\tests\conversation_host;
use humhub\modules\matcherRecommendation\contracts\CandidateRequest;
use humhub\modules\matcherRecommendation\contracts\ports\{AiPlatformBudget,ContactEligibilityReader,ConversationProvider};
final class State {
    public static function path(): string { return dirname(__DIR__,5).'/.runtime/recommendation-integration-audit'; }
    public static function mode(): array { return json_decode(file_get_contents(self::path().'/mode.json'),true,32,JSON_THROW_ON_ERROR); }
    public static function log(array $row): void { file_put_contents(self::path().'/calls.jsonl',json_encode($row,JSON_THROW_ON_ERROR).PHP_EOL,FILE_APPEND|LOCK_EX); }
    public static function revoke(int $id): void {
        $p=\Yii::$app->getModule('matcher-user-profile')->getProfileService(); $scope=\humhub\modules\matcherProfile\domain\ProfileScope::global();
        $profile=$p->getProfile($id,$id,$scope); $ops=[];
        foreach($profile['attributes'] as $a) { if(in_array($a['key'],['interest','skill'],true)) { $ops[]=['op'=>'upsert','attribute_id'=>$a['attribute_id'],'visibility'=>'private']; } }
        $d=$p->startDraft($id,$id,$scope,'manual',false); $d=$p->updateDraft($id,$id,$scope,$d['id'],$d['draft_version'],$ops);
        $p->confirmDraft($id,$id,$scope,$d['id'],$d['draft_version'],$d['base_revision']);
    }
}
/** Complete synthetic historical facts for these newly-created fictional accounts only. */
final class History implements ContactEligibilityReader {
    public function readCurrent(CandidateRequest $request): array { throw new \LogicException('Synthetic history must never replace native current relationships'); }
    public function supportsSentHistory(): bool { return true; }
    public function readSentHistory(CandidateRequest $request): array { $f=json_decode(file_get_contents(State::path().'/fixture.json'),true,32,JSON_THROW_ON_ERROR);$rows=[]; foreach($request->targetIds as $id) { $rows[$id]=['ever_sent'=>(int)$id===$f['users'][23],'version'=>'synthetic-history-v1-'.$id]; } return $rows; }
}
/** Test platform capability, never described as the missing production platform ledger. */
final class Platform implements AiPlatformBudget {
    public function reserveAttempt(string $runId,string $stage,string $permitId): void {
        State::log(['kind'=>'platform','stage'=>$stage]);
        $mode=State::mode();
        if(($mode['mutation']??null)==='revoke_before_respond' && $stage==='respond') { State::revoke((int)$mode['target_id']); }
        if(($mode['mutation']??null)==='pause_before_model') { \Yii::$app->getModule('matcher-recommendation')->pauseConversations(); }
        if(State::mode()['platform_reject'] ?? false) { throw new \humhub\modules\matcherRecommendation\domain\ai\AiRecommendationException('budget_exhausted'); }
    }
}
/** Deterministic zero-network provider; records only stage and candidate IDs. */
final class Provider implements ConversationProvider {
    public function plan(array $input,string $permit): array {
        State::log(['kind'=>'model','stage'=>'plan']);
        return ['action'=>'search','message'=>'Synthetic common-topic search.','conditions'=>[['feature'=>'topics','operator'=>'similarity','value'=>['social'],'strength'=>'soft','origin'=>'interpreted_draft']]];
    }
    public function respond(array $input,string $permit): array {
        $candidates=$input['candidates']??[]; State::log(['kind'=>'model','stage'=>'respond','ids'=>array_column($candidates,'id')]);
        $mode=State::mode(); if(($mode['mutation']??null)==='revoke_respond' && count($candidates)>1) { State::revoke((int)$candidates[1]['id']); }
        if(($mode['mutation']??null)==='pause_respond') { \Yii::$app->getModule('matcher-recommendation')->pauseConversations(); }
        if($candidates===[]) { return ['message'=>'Synthetic no match.','items'=>[]]; }
        $c=$candidates[0]; $positive=current(array_filter($c['facts'],static fn(array $f):bool=>$f['positive']));
        $unselected=count($candidates)>1 ? ' Unselected synthetic participant '.$candidates[1]['id'].' also has the confirmed shared social topic.' : '';
        return ['message'=>'Synthetic result using the authorized shared topic.'.$unselected,'items'=>[['id'=>$c['id'],'fact_ids'=>[$positive['id']],'reason'=>'Synthetic shared topic.','gaps'=>['Actual collaboration remains to be confirmed.']]]];
    }
}
