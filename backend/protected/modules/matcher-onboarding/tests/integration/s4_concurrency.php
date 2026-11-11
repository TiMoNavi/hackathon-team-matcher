<?php
declare(strict_types=1);
/** Two independent PHP/MySQL processes exercise create and answer races. */
if (($argv[2] ?? '') === '--worker') {
    $app = require __DIR__ . '/s4_http_bootstrap.php';
    echo "ready" . PHP_EOL; fflush(STDOUT); fgets(STDIN);
    try {
        if ($argv[3] === 'start') { $result = $app->getModule('matcher-onboarding')->getOnboardingService()->start((int)$argv[4], null); $id = $result['id']; }
        else { $result = $app->getModule('matcher-user-profile')->getQuestionService()->answer((int)$argv[4], $argv[5], $argv[6], 0, ['answer_type' => 'skipped']); $id = $result['id']; }
        echo json_encode(['status' => 200, 'id' => $id], JSON_THROW_ON_ERROR), PHP_EOL;
    } catch (\humhub\modules\matcherProfile\domain\ProfileException $error) { echo json_encode(['status' => $error->httpStatus, 'code' => $error->errorCode], JSON_THROW_ON_ERROR), PHP_EOL; }
    catch (\Throwable $error) { echo json_encode(['status' => 500, 'type' => get_class($error)], JSON_THROW_ON_ERROR), PHP_EOL; }
    exit;
}
ob_start(); require __DIR__ . '/s4_fixture.php'; $fixture = json_decode(ob_get_clean(), true, 32, JSON_THROW_ON_ERROR);
$checks = [];
$ok = static function (string $name, bool $condition) use (&$checks): void { if (!$condition) { throw new RuntimeException($name); } $checks[] = $name; };
$race = static function (array $args) use ($argv): array {
    $children = [];
    for ($i = 0; $i < 2; ++$i) {
        $command = [PHP_BINARY, '-c', php_ini_loaded_file(), __FILE__, $argv[1], '--worker', ...$args];
        $process = proc_open($command, [['pipe','r'], ['pipe','w'], ['pipe','w']], $pipes);
        if (!is_resource($process)) { throw new RuntimeException('Could not create isolated race worker.'); }
        stream_set_timeout($pipes[1], 15); stream_set_timeout($pipes[2], 15);
        if (trim((string)fgets($pipes[1])) !== 'ready') { throw new RuntimeException('Race worker did not initialize.'); }
        $children[] = ['process' => $process, 'pipes' => $pipes];
    }
    foreach ($children as $child) { fwrite($child['pipes'][0], "go" . PHP_EOL); fflush($child['pipes'][0]); fclose($child['pipes'][0]); }
    $results = [];
    foreach ($children as $child) {
        $line = fgets($child['pipes'][1]); $error = stream_get_contents($child['pipes'][2]);
        fclose($child['pipes'][1]); fclose($child['pipes'][2]); $code = proc_close($child['process']);
        if ($code !== 0 || $error !== '' || $line === false) { throw new RuntimeException('Race worker failed.'); }
        $results[] = json_decode($line, true, 16, JSON_THROW_ON_ERROR);
    }
    return $results;
};
try {
    $owner = $fixture['users']['owner']; $flow = $app->getModule('matcher-onboarding')->getOnboardingService(); $db = $app->db;
    $started = $race(['start', (string)$owner]);
    $ok('concurrent_initial_session_requests_both_succeed', array_column($started, 'status') === [200,200]);
    $ok('concurrent_initial_requests_resume_one_session', $started[0]['id'] === $started[1]['id']);
    $ok('one_active_session_is_persisted', (int)(new \yii\db\Query())->from('{{%matcher_onboarding_session}}')->where(['owner_id' => $owner, 'scope_key' => 'global', 'status' => 'active'])->count('*', $db) === 1);
    $session = $flow->get($owner, $started[0]['id']); $draft = $session['input_drafts']['global'];
    $session = $flow->update($owner, $session['id'], $session['version'], ['action' => 'review_confirm', 'confirmation_intent' => 'confirm', 'draft_versions' => ['global' => ['draft_version' => $draft['draft_version'], 'base_revision' => $draft['base_revision']]]]);
    $session = $flow->prepareQuestions($owner, $session['id'], $session['version']); $batch = $session['question_batch']; $question = $batch['questions'][0];
    $answered = $race(['answer', (string)$owner, $batch['id'], $question['id']]); $statuses = array_column($answered, 'status'); sort($statuses);
    $ok('concurrent_answer_writers_have_one_winner_and_one_conflict', $statuses === [200,409]);
    $current = $app->getModule('matcher-user-profile')->getQuestionService()->get($owner, $batch['id']);
    $ok('answer_race_advances_batch_exactly_once', $current['version'] === $batch['version'] + 1);
    $ok('answer_race_persists_one_version_one_record', count($current['answers']) === 1 && $current['answers'][0]['version'] === 1);
    echo json_encode(['status' => 'passed', 'passed' => count($checks), 'checks' => $checks], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR), PHP_EOL;
} catch (\Throwable $error) {
    fwrite(STDERR, json_encode(['status' => 'failed', 'type' => get_class($error), 'reason' => $error instanceof RuntimeException ? $error->getMessage() : 'Concurrent integration failed.', 'completed_checks' => $checks], JSON_THROW_ON_ERROR) . PHP_EOL); exit(1);
}
