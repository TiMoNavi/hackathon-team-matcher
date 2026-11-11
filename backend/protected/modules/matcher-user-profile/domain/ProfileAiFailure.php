<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\domain;

/** Stable, sanitized model failure with usage accounting for calls already attempted. */
final class ProfileAiFailure extends \RuntimeException
{
    public function __construct(public readonly string $errorCode, public readonly array $metrics = [])
    { parent::__construct('The AI profile operation could not be completed.'); }
}
