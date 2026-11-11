<?php
declare(strict_types=1);
namespace humhub\modules\matcherWebImport\domain\ports;
interface WebDocumentParser
{
    /** Return plain raw_text, located sections and parsing metadata. */
    public function parse(string $body, string $contentType): array;
}
