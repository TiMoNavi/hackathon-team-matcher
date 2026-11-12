<?php
declare(strict_types=1);
namespace humhub\modules\matcherChat\domain\ports;

interface Clock { public function now(): int; }
