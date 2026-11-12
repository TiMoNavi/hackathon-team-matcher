<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\domain\analysis;

use humhub\modules\matcherRecommendation\contracts\{CandidateProjection, CurrentEventContext};

/**
 * Pure, internal explanations over two already-authorized minimal projections.
 * Callers must revalidate current activity, field purpose, permissions and revisions before
 * and after use. Structural checks here do not authorize a read or detect later revocation.
 * This class never determines eligibility, ranking, hard-condition compliance or personality.
 */
final class CooperationAnalyzer
{
    public const VERSION = 'cooperation-analysis-internal-v1';

    public function analyze(CurrentEventContext $context, CandidateProjection $self, CandidateProjection $candidate, AnalysisMapping $mapping): array
    {
        if ($self->targetType !== 'person' || $candidate->targetType !== 'person'
            || $self->targetId !== (string)$context->viewerId || $candidate->targetId === $self->targetId
            || !preg_match('/^[1-9][0-9]*$/D', $candidate->targetId)) {
            throw new \InvalidArgumentException('Analysis requires the viewer and a different person.');
        }
        foreach ([$self, $candidate] as $projection) {
            if ($projection->spaceId !== $context->spaceId
                || !isset($projection->versions->scopes['space:' . $context->spaceId])
                || $projection->versions->schemaVersion !== $mapping->schemaVersion) {
                throw new \InvalidArgumentException('Both subjects need the current activity and reviewed schema versions.');
            }
        }
        $a = $this->read($self, 'self', $mapping); $b = $this->read($candidate, 'candidate', $mapping);
        return [
            'analysis_version' => self::VERSION, 'usage' => 'internal_explanation_only',
            'authorization' => 'caller_must_revalidate', 'hard_conditions_checked' => false,
            'space_id' => $context->spaceId, 'self_id' => $self->targetId, 'candidate_id' => $candidate->targetId,
            // Context is an internal audit/cache discriminator, not a reusable authorization token
            // or public payload. Consumers still revalidate access before reading or reusing results.
            'basis_version' => ['context' => get_object_vars($context),
                'mapping_version' => $mapping->version, 'mapping_fingerprint' => $mapping->fingerprint(),
                'self' => get_object_vars($self->versions), 'candidate' => get_object_vars($candidate->versions)],
            'dimensions' => [
                $this->capability($a, $b), $this->topics($a, $b), $this->roles($a, $b),
                $this->availability($a, $b), $this->collaboration($a, $b),
            ],
        ];
    }

    private function read(CandidateProjection $projection, string $subject, AnalysisMapping $mapping): array
    {
        $slots = [];
        foreach (AnalysisMapping::SEMANTICS as $semantic) {
            $values = []; $evidence = [];
            foreach ($mapping->features($semantic) as $featureName) {
                $feature = $projection->features[$featureName] ?? null;
                if ($feature === null) { continue; }
                if (count($feature['evidence']) > 128) { throw new \InvalidArgumentException('Too many analysis evidence references.'); }
                $parsed = $semantic === 'availability' ? self::intervals($feature['value']) : self::tokens($feature['value']);
                // Empty collections are unavailable facts, not affirmative evidence or a hidden-field signal.
                foreach ($feature['evidence'] as $ref) {
                    if ($mapping->requiresEventEvidence($semantic) && $ref->scope !== 'space:' . $projection->spaceId) {
                        throw new \InvalidArgumentException('Current-event offers, needs and arrangements require event evidence.');
                    }
                    if ($parsed !== []) {
                        $evidence[] = ['subject' => $subject, 'target_id' => $projection->targetId, 'feature' => $featureName,
                            'semantic' => $semantic, 'attribution' => 'feature_bundle', 'reference' => get_object_vars($ref)];
                    }
                }
                array_push($values, ...$parsed);
            }
            if ($semantic === 'availability') { $values = self::merge($values); }
            else { $values = array_values(array_unique($values)); sort($values, SORT_STRING); }
            $slots[$semantic] = ['known' => $values !== [], 'values' => $values, 'evidence' => self::uniqueEvidence($evidence)];
        }
        return $slots;
    }

    private function capability(array $a, array $b): array
    {
        $needs = $a['needed_skills']; $skills = $b['capability_skills']; $offers = $b['offered_skills'];
        $skillComparison = self::coverage($needs, $skills); $offerComparison = self::coverage($needs, $offers);
        $status = 'unknown'; $code = 'insufficient_task_capability_evidence';
        if ($skillComparison['status'] === 'supported' && $offerComparison['status'] === 'supported') {
            $status = 'supported'; $code = 'recorded_skills_and_offers_cover_recorded_needs';
        } elseif ($skillComparison['matched'] !== [] || $offerComparison['matched'] !== []) {
            $status = 'partial'; $code = 'capability_or_current_contribution_needs_confirmation';
        } elseif ($skillComparison['status'] === 'conflict' && $offerComparison['status'] === 'conflict') {
            $status = 'conflict'; $code = 'recorded_skills_and_offers_do_not_cover_recorded_needs';
        }
        return self::row('contribution_capability', $status, $code, [$needs, $skills, $offers],
            ['capability' => $skillComparison, 'current_contribution' => $offerComparison],
            $status === 'supported' ? ['confirm_task_scope'] : ['confirm_needed_skills', 'confirm_relevant_experience', 'confirm_current_contribution']);
    }

    private function topics(array $a, array $b): array
    {
        $left = $a['topics']; $right = $b['topics']; $matches = self::intersection($left['values'], $right['values']);
        $status = !$left['known'] || !$right['known'] ? 'unknown'
            : ($matches === [] ? 'conflict' : ($left['values'] === $right['values'] ? 'supported' : 'partial'));
        $code = match ($status) {
            'unknown' => 'declared_directions_unavailable', 'conflict' => 'no_shared_declared_direction_codes',
            default => 'shared_declared_direction_codes',
        };
        return self::row('project_direction', $status, $code, [$left, $right], ['shared_codes' => $matches], ['confirm_project_problem_and_scope']);
    }

    private function roles(array $a, array $b): array
    {
        $candidateToSelf = self::coverage($a['needed_roles'], $b['offered_roles']);
        $selfToCandidate = self::coverage($b['needed_roles'], $a['offered_roles']);
        $states = [$candidateToSelf['status'], $selfToCandidate['status']];
        $status = $states === ['supported', 'supported'] ? 'supported'
            : (($candidateToSelf['matched'] !== [] || $selfToCandidate['matched'] !== []) ? 'partial'
            : ($states === ['conflict', 'conflict'] ? 'conflict' : 'unknown'));
        $code = match ($status) {
            'supported' => 'reciprocal_declared_role_needs_covered', 'partial' => 'one_way_or_partial_role_coverage',
            'conflict' => 'no_coverage_of_declared_role_needs', default => 'reciprocal_role_evidence_incomplete',
        };
        return self::row('role_complementarity', $status, $code, [$a['needed_roles'], $b['offered_roles'], $b['needed_roles'], $a['offered_roles']],
            ['candidate_to_self' => $candidateToSelf, 'self_to_candidate' => $selfToCandidate], ['confirm_roles_and_responsibilities']);
    }

    private function availability(array $a, array $b): array
    {
        $left = $a['availability']; $right = $b['availability']; $overlaps = [];
        foreach ($left['values'] as [$startA, $endA]) {
            foreach ($right['values'] as [$startB, $endB]) {
                $start = max($startA, $startB); $end = min($endA, $endB);
                if ($start < $end) { $overlaps[] = [$start, $end]; }
            }
        }
        $overlaps = self::merge($overlaps);
        $status = !$left['known'] || !$right['known'] ? 'unknown'
            : ($overlaps === [] ? 'conflict' : ($left['values'] === $right['values'] ? 'supported' : 'partial'));
        $code = match ($status) {
            'unknown' => 'availability_unavailable', 'conflict' => 'no_overlap_in_recorded_windows',
            default => 'shared_available_windows_only',
        };
        $windows = array_map(static fn(array $window): array => ['starts_at' => self::formatTime($window[0]), 'ends_at' => self::formatTime($window[1]), 'timezone' => 'UTC'], $overlaps);
        return self::row('availability', $status, $code, [$left, $right],
            ['shared_windows' => $windows, 'hard_condition_check' => 'not_performed'], ['confirm_required_windows_and_commitment']);
    }

    private function collaboration(array $a, array $b): array
    {
        $comparisons = []; $evidence = [];
        foreach (['collaboration_modes', 'communication_preferences'] as $semantic) {
            $left = $a[$semantic]; $right = $b[$semantic];
            $matches = self::intersection($left['values'], $right['values']);
            $comparisons[$semantic] = ['status' => !$left['known'] || !$right['known'] ? 'unknown' : ($matches === [] ? 'conflict' : 'supported'),
                'shared_codes' => $matches];
            array_push($evidence, $left, $right);
        }
        $states = array_column($comparisons, 'status');
        $status = in_array('conflict', $states, true) ? 'conflict'
            : ($states === ['supported', 'supported'] ? 'supported' : (in_array('supported', $states, true) ? 'partial' : 'unknown'));
        $code = match ($status) {
            'conflict' => 'some_recorded_arrangements_have_no_shared_code', 'unknown' => 'collaboration_preferences_unavailable',
            default => 'shared_explicit_arrangement_codes',
        };
        return self::row('collaboration_arrangements', $status, $code, $evidence, $comparisons, ['agree_on_working_arrangements']);
    }

    private static function row(string $dimension, string $status, string $code, array $slots, array $facts, array $questions): array
    {
        $evidence = []; foreach ($slots as $slot) { array_push($evidence, ...$slot['evidence']); }
        return ['dimension' => $dimension, 'status' => $status, 'conclusion_code' => $code,
            'evidence' => self::uniqueEvidence($evidence), 'facts' => $facts, 'question_codes' => $questions,
            'explanation_source' => 'rules', 'eligibility_decision' => false];
    }

    /** Directional set coverage is a statement about recorded facts, never a hard-requirement decision. */
    private static function coverage(array $needs, array $offers): array
    {
        $matches = self::intersection($needs['values'], $offers['values']);
        return ['status' => !$needs['known'] || !$offers['known'] ? 'unknown'
            : ($matches === [] ? 'conflict' : (count($matches) === count($needs['values']) ? 'supported' : 'partial')),
            'matched' => $matches, 'uncovered_recorded_needs' => array_values(array_diff($needs['values'], $matches))];
    }
    private static function intersection(array $left, array $right): array { return array_values(array_intersect($left, $right)); }
    private static function uniqueEvidence(array $evidence): array
    {
        $unique = []; foreach ($evidence as $row) { $unique[json_encode($row, JSON_THROW_ON_ERROR)] = $row; }
        ksort($unique, SORT_STRING); return array_values($unique);
    }
    private static function tokens(mixed $value): array
    {
        if (!is_array($value) || !array_is_list($value) || count($value) > 64) {
            throw new \InvalidArgumentException('Analysis codes must be a bounded list of strings, never free-text inference.');
        }
        $tokens = [];
        foreach ($value as $token) {
            if (!is_string($token) || !mb_check_encoding($token, 'UTF-8') || mb_strlen($token, 'UTF-8') > 64
                || preg_match('/[\x00-\x1F\x7F]/u', $token) || trim($token) === '') {
                throw new \InvalidArgumentException('Use nonempty explicit codes of at most 64 characters.');
            }
            $tokens[] = mb_strtolower(trim($token), 'UTF-8');
        }
        $tokens = array_values(array_unique($tokens)); sort($tokens, SORT_STRING); return $tokens;
    }
    private static function intervals(mixed $value): array
    {
        if (!is_array($value) || !array_is_list($value) || count($value) > 32) {
            throw new \InvalidArgumentException('Availability must be a bounded list of explicit intervals.');
        }
        $windows = [];
        foreach ($value as $interval) {
            if (!is_array($interval) || array_diff(array_keys($interval), ['starts_at', 'ends_at', 'timezone']) !== []
                || !isset($interval['starts_at'], $interval['ends_at'])) { throw new \InvalidArgumentException('Invalid interval fields.'); }
            $start = self::date($interval['starts_at']); $end = self::date($interval['ends_at']);
            if (isset($interval['timezone'])) {
                if (!is_string($interval['timezone']) || !in_array($interval['timezone'], \DateTimeZone::listIdentifiers(\DateTimeZone::ALL_WITH_BC), true)) {
                    throw new \InvalidArgumentException('Use a named time zone when supplying timezone.');
                }
                $zone = new \DateTimeZone($interval['timezone']);
                if ($zone->getOffset($start) !== $start->getOffset() || $zone->getOffset($end) !== $end->getOffset()) {
                    throw new \InvalidArgumentException('The explicit offsets disagree with the supplied time zone.');
                }
            } elseif (array_key_exists('timezone', $interval)) { throw new \InvalidArgumentException('A supplied timezone cannot be null.'); }
            $from = $start->getTimestamp() * 1000000 + (int)$start->format('u');
            $to = $end->getTimestamp() * 1000000 + (int)$end->format('u');
            if ($from >= $to) { throw new \InvalidArgumentException('Availability must have a positive duration.'); }
            $windows[] = [$from, $to];
        }
        return self::merge($windows);
    }
    private static function date(mixed $value): \DateTimeImmutable
    {
        if (!is_string($value) || str_ends_with($value, '-00:00')
            || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/D', $value)) {
            throw new \InvalidArgumentException('Explicit valid time-zone offsets are required.');
        }
        try { $date = new \DateTimeImmutable($value); } catch (\Throwable $error) { throw new \InvalidArgumentException('Invalid date.', 0, $error); }
        $errors = \DateTimeImmutable::getLastErrors();
        if ($errors !== false && ($errors['warning_count'] || $errors['error_count'])) { throw new \InvalidArgumentException('Invalid calendar date.'); }
        return $date;
    }
    private static function merge(array $windows): array
    {
        usort($windows, static fn(array $a, array $b): int => $a <=> $b); $merged = [];
        foreach ($windows as $window) {
            $last = count($merged) - 1;
            if ($last >= 0 && $window[0] <= $merged[$last][1]) { $merged[$last][1] = max($merged[$last][1], $window[1]); }
            else { $merged[] = $window; }
        }
        return $merged;
    }
    private static function formatTime(int $microseconds): string
    {
        $seconds = intdiv($microseconds, 1000000); $remainder = $microseconds % 1000000;
        if ($remainder < 0) { $seconds--; $remainder += 1000000; }
        return (new \DateTimeImmutable('@' . $seconds))->format('Y-m-d\TH:i:s') . sprintf('.%06dZ', $remainder);
    }
}
