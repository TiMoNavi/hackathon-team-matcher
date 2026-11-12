<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\domain;

final class PageRequest
{
    public readonly int $limit;
    public readonly ?string $cursor;
    public readonly ?int $afterSeq;

    public function __construct(mixed $limit = 24, mixed $cursor = null, mixed $afterSeq = null)
    {
        $this->limit = SafeInteger::positive($limit, 'limit');
        if ($this->limit > 48 || ($cursor !== null && (!is_string($cursor) || $cursor === '' || strlen($cursor) > 4096)) || ($cursor !== null && $afterSeq !== null)) {
            throw new ChatException('INVALID_ARGUMENT', 'The pagination parameters are invalid.');
        }
        $this->cursor = $cursor;
        $this->afterSeq = $afterSeq === null ? null : SafeInteger::nonNegative($afterSeq, 'after_seq');
    }
}
