<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;

interface QueryInterpreter
{
    /**
     * Optional AI provider. Input: bounded message, explicitly selected self attributes, schema/prompt versions.
     * No viewer/event/SQL authority. callPermit is an already-reserved attempt from the core budget owner.
     * Output is a typed-schema draft or clarification; never automatically promotes interpreted conditions to hard.
     * Provider retries require another counted permit. Concrete schema and execution are R6, not this R0 draft.
     * @param array<string,mixed> $minimalInput
     * @return array<string,mixed>
     */
    public function interpret(array $minimalInput, string $callPermit): array;
}
