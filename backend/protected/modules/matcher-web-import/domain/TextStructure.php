<?php
declare(strict_types=1);
namespace humhub\modules\matcherWebImport\domain;

use humhub\modules\matcherProfile\domain\ProfileException;

/** Plain Unicode source and line-addressed sections; never markup or instructions. */
final class TextStructure
{
    public static function normalize(string $text, int $maxBytes = WebLimits::TEXT_BYTES): string
    {
        if (strlen($text) > $maxBytes) { throw new ProfileException('SOURCE_TEXT_TOO_LARGE', 'The source text exceeds the supported size.', 413); }
        if (!mb_check_encoding($text, 'UTF-8') || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $text)) {
            throw new ProfileException('SOURCE_TEXT_INVALID', 'Provide readable UTF-8 text.');
        }
        if (str_starts_with($text, "\xEF\xBB\xBF")) { $text = substr($text, 3); }
        $text = str_replace(["\r\n", "\r"], "\n", $text);
        if (trim($text) === '' || preg_match('/^\s*$/u', $text)) { throw new ProfileException('SOURCE_NO_TEXT', 'No readable source text was found.'); }
        return $text;
    }

    public static function build(string $text, string $format): array
    {
        $text = self::normalize($text); $sections = []; $line = 1; $index = 0;
        foreach (explode("\n", $text) as $value) {
            if (trim($value) !== '') {
                $offset = 0;
                while ($offset < strlen($value)) {
                    $piece = mb_strcut($value, $offset, WebLimits::SECTION_BYTES, 'UTF-8');
                    $sections[] = ['id' => 'section-' . ++$index, 'label' => 'Line ' . $line, 'text' => $piece,
                        'locator' => ['format' => $format, 'line_start' => $line, 'line_end' => $line, 'byte_offset' => $offset]];
                    $offset += strlen($piece);
                    if ($index > WebLimits::SECTIONS) { throw new ProfileException('SOURCE_SECTION_LIMIT', 'The source has too many text sections.', 413); }
                }
            }
            $line++;
        }
        if ($sections === []) { throw new ProfileException('SOURCE_NO_TEXT', 'No readable source text was found.'); }
        return ['raw_text' => $text, 'sections' => $sections];
    }
}
