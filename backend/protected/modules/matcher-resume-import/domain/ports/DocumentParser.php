<?php
declare(strict_types=1);
namespace humhub\modules\matcherResumeImport\domain\ports;

interface DocumentParser
{
    public function available(): bool;
    /** @return array{raw_text:string,sections:array,metadata:array} */
    public function parse(string $path, string $format): array;
}
