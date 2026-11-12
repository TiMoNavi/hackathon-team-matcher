<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\adapters\security;

use humhub\modules\matcherChat\domain\ports\Clock;

final class SystemClock implements Clock { public function now(): int { return time(); } }
