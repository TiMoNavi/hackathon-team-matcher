<?php
declare(strict_types=1);
namespace humhub\modules\matcherWebImport\domain;

final class WebLimits
{
    public const URL_BYTES = 2048;
    public const BODY_BYTES = 1048576;
    public const TEXT_BYTES = 262144;
    public const PASTE_BYTES = 131072;
    public const SECTION_BYTES = 16384;
    public const SECTIONS = 2000;
    public const REDIRECTS = 3;
    public const TOTAL_MS = 15000;
    public const DNS_MS = 3000;
    public const REQUEST_MS = 10000;
}
