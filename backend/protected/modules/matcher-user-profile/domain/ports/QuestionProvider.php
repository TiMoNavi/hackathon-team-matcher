<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\domain\ports;
interface QuestionProvider { public function questions(array $profiles, ?int $spaceId): array; }
