<?php
declare(strict_types=1);
namespace humhub\modules\matcherIdeas\domain;

/** Explicitly confirmed formal text. Neither Messenger titles nor messages are sources. */
final class IdeaContent
{
    public readonly string $title;
    public readonly string $summary;
    public function __construct(string $title, string $summary)
    {
        $this->title = self::text($title, 160, 'title');
        $this->summary = self::text($summary, 2000, 'summary');
    }
    private static function text(string $value, int $maximum, string $field): string
    {
        $value = trim($value);
        if (!preg_match('//u', $value) || $value === '' || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', $value)
            || preg_match_all('/./us', $value) > $maximum) {
            throw new IdeaException('IDEA_VALIDATION_FAILED', 'A nonempty valid ' . $field . ' is required (maximum ' . $maximum . ' characters).');
        }
        return $value;
    }
}
