<?php
declare(strict_types=1);

/** Local acceptance evidence only. No mailbox, credential, callback URL or profile is recorded. */
function overnightRecordAuthEvidence(string $runtime, string $secret, string $kind, string $provider, int $userId): void
{
    if (!in_array($kind, ['login', 'me_read'], true) || !in_array($provider, ['email-code', 'github'], true) || $userId < 1) { return; }
    $lock = null; $temporary = null;
    try {
        $path = $runtime . '/auth-evidence.json';
        $lockPath = $runtime . '/auth-evidence.lock';
        if (is_link($path) || is_link($lockPath)) { return; }
        $oldUmask = umask(0077);
        try { $lock = @fopen($lockPath, 'c+b'); } finally { umask($oldUmask); }
        if (!$lock || !flock($lock, LOCK_EX)) { return; }
        if (is_file($path)) {
            if ((fileperms($path) & 0777) !== 0600) { return; }
            $data = json_decode(file_get_contents($path), true, 8, JSON_THROW_ON_ERROR);
            if (!is_array($data) || ($data['schema_version'] ?? null) !== 1 || !is_array($data['account_hashes'] ?? null)) { return; }
        } else {
            $data = ['schema_version' => 1, 'login' => ['email-code' => 0, 'github' => 0],
                'me_read' => ['email-code' => 0, 'github' => 0], 'account_hashes' => []];
        }
        if (!is_int($data[$kind][$provider] ?? null) || $data[$kind][$provider] < 0 || count($data['account_hashes']) > 16) { return; }
        $data[$kind][$provider]++;
        $hash = hash_hmac('sha256', 'local-auth-evidence:' . $userId, $secret);
        if (!in_array($hash, $data['account_hashes'], true)) { $data['account_hashes'][] = $hash; }
        $temporary = $path . '.tmp-' . bin2hex(random_bytes(8));
        $oldUmask = umask(0077);
        try { $output = @fopen($temporary, 'x+b'); } finally { umask($oldUmask); }
        if (!$output) { return; }
        try {
            $json = json_encode($data, JSON_THROW_ON_ERROR);
            if (fwrite($output, $json) !== strlen($json) || !fflush($output) || !fsync($output)) { return; }
        } finally { fclose($output); }
        @rename($temporary, $path);
    } catch (\Throwable) {
        // Evidence failure must never change authentication or expose private diagnostics.
    } finally {
        if ($temporary !== null && is_file($temporary)) { @unlink($temporary); }
        if (is_resource($lock)) { flock($lock, LOCK_UN); fclose($lock); }
    }
}

function overnightAuthEvidenceSummary(string $runtime): array
{
    $empty = ['available' => false, 'login' => ['email-code' => 0, 'github' => 0],
        'me_read' => ['email-code' => 0, 'github' => 0], 'distinct_accounts' => 0, 'same_account_verified' => false];
    try {
        $path = $runtime . '/auth-evidence.json';
        if (!is_file($path) || is_link($path) || (fileperms($path) & 0777) !== 0600) { return $empty; }
        $data = json_decode(file_get_contents($path), true, 8, JSON_THROW_ON_ERROR);
        if (($data['schema_version'] ?? null) !== 1 || !is_array($data['account_hashes'] ?? null)) { return $empty; }
        foreach (['login', 'me_read'] as $kind) {
            foreach (['email-code', 'github'] as $provider) {
                if (!is_int($data[$kind][$provider] ?? null) || $data[$kind][$provider] < 0) { return $empty; }
                $empty[$kind][$provider] = $data[$kind][$provider];
            }
        }
        $empty['available'] = true;
        $empty['distinct_accounts'] = count(array_unique($data['account_hashes']));
        $empty['same_account_verified'] = $empty['distinct_accounts'] === 1
            && min($empty['login']) > 0 && min($empty['me_read']) > 0;
        return $empty;
    } catch (\Throwable) { return $empty; }
}

function overnightAttachAuthEvidence(object $app, string $runtime, string $secret): void
{
    $record = static function (string $kind) use ($app, $runtime, $secret): void {
        try {
            if ($app->user->isGuest) { return; }
            $client = $app->user->getCurrentAuthClient();
            if ($client !== null) { overnightRecordAuthEvidence($runtime, $secret, $kind, $client->getId(), (int)$app->user->id); }
        } catch (\Throwable) { /* No auth effects, raw logs or external calls. */ }
    };
    \yii\base\Event::on(\humhub\modules\user\controllers\AuthController::class,
        \humhub\modules\user\controllers\AuthController::EVENT_AFTER_LOGIN, static function () use ($record): void { $record('login'); });
    $app->response->on(\yii\web\Response::EVENT_AFTER_SEND, static function () use ($app, $record): void {
        try {
            if ($app->request->getPathInfo() === 'api/v1/me' && $app->request->getMethod() === 'GET' && $app->response->statusCode === 200) { $record('me_read'); }
        } catch (\Throwable) {}
    });
}
