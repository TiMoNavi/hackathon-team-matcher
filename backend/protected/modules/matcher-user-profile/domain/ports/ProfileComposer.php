<?php
declare(strict_types=1);
namespace humhub\modules\matcherProfile\domain\ports;
interface ProfileComposer { public function compose(array $profiles, array $questions, array $answers): array; }
