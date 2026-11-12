<?php
declare(strict_types=1);
namespace humhub\modules\matcherAuth\domain\ports;

interface OtpMailer
{
    public function available(): bool;
    /** A true result means the configured mail transport accepted this actual send. */
    public function send(string $email, string $code, int $expiresIn): bool;
}
