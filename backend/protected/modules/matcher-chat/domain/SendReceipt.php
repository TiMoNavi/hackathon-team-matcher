<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\domain;

final class SendReceipt
{
    public function __construct(public readonly int $entryId, public readonly int $seq, public readonly string $bodyHash)
    {
        SafeInteger::positive($entryId, 'entry_id');
        SafeInteger::positive($seq, 'seq');
        if (preg_match('/^[a-f0-9]{64}$/D', $bodyHash) !== 1) { throw new \LogicException('Invalid receipt hash.'); }
    }
}
