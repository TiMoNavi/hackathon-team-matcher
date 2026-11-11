<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/support/autoload.php';

use humhub\modules\matcherRecommendation\contracts\{CandidateProjection, CurrentEventContext, QueryIntent};
use humhub\modules\matcherRecommendation\domain\{RuleAssessment, RulePolicy};
use humhub\modules\matcherRecommendation\domain\rules\DeterministicRuleEvaluator;
use humhub\modules\matcherRecommendation\tests\rules\Fixtures as F;

$checks = [];
function verify(bool $condition, string $label): void { global $checks; if (!$condition) { throw new RuntimeException('FAIL: ' . $label); } $checks[] = $label; }
function near(float $actual, float $expected, string $label): void { verify(abs($actual - $expected) < 1e-12, $label); }
function rejects(callable $action, string $label, string $expected = InvalidArgumentException::class): void
{
    try { $action(); } catch (Throwable $e) { verify($e instanceof $expected, $label); return; }
    verify(false, $label);
}
$topic = F::condition('topics', 'similarity', ['robotics']);
$need = F::condition('needs', 'supply_demand', ['backend']);
$time = F::condition('availability', 'interval_overlap', [F::interval()]);
$style = F::condition('preferences', 'explicit_preference', ['async']);
$r = F::evaluate([$topic], ['topics' => ['robotics']]);
verify($r->qualifies, 'explicit topic match qualifies');
near($r->diagnostics->matchScore, 1.0, 'single requested dimension normalized once');
near($r->diagnostics->rrfScore, 2 / 3, 'disabled semantic route normalizes enabled routes globally');
near($r->sortScore, .8 + .2 * 2 / 3, 'exact coarse score uses .8 match plus .2 RRF');
verify($r->diagnostics->diversityKeys === ['topic:robotics'], 'diversity uses only positive canonical topic evidence');
verify($r->reasons[0]->evidence[0]->attributeId() === 'attribute-fixture-topics', 'reason keeps authorized stable attribute reference');

$all = [$topic, $need, $time, $style];
$sparse = F::evaluate($all, ['topics' => ['robotics']]);
near($sparse->diagnostics->matchScore, .675, 'unknown requested dimensions stay .5 without candidate-wise renormalization');
near($sparse->diagnostics->evidenceCoverage, .35, 'known evidence coverage remains separate from match score');
verify($sparse->diagnostics->normalizedWeights === ['topic' => .35, 'contribution' => .35, 'availability' => .15, 'collaboration_style' => .15], 'all candidates share query-derived four-dimension weights');
verify(count($sparse->diagnostics->unknowns) === 3 && $sparse->qualifies, 'optional unknowns do not automatically exclude a person with topic evidence');
$unknown = F::evaluate($all, []);
near($unknown->diagnostics->matchScore, .5, 'fully unknown candidate receives only neutral match score');
near($unknown->diagnostics->evidenceCoverage, 0.0, 'fully unknown candidate has zero evidence coverage');
verify(!$unknown->qualifies && $unknown->reasons === [] && $unknown->diagnostics->insufficiency === 'no_positive_evidence', 'neutral unknown score cannot manufacture a recommendation');
$noQuery = F::evaluate([], ['topics' => ['robotics']]);
verify(!$noQuery->qualifies && $noQuery->diagnostics->insufficiency === 'no_query_dimensions', 'empty query does not infer unrequested goals');
$rich = F::evaluate([$topic], ['topics' => ['robotics'], 'offers' => ['backend'], 'self_type' => 'INTJ', 'unrequested_activity_count' => 999]);
near($rich->sortScore, $r->sortScore, 'extra profile fields and activity counts do not increase ranking');

$partial = F::evaluate([F::condition('topics', 'similarity', ['robotics', 'education'])], ['topics' => ['robotics']]);
near($partial->diagnostics->matchScore, .5, 'partial set coverage uses .5');
verify($partial->qualifies && $partial->diagnostics->diversityKeys === ['topic:robotics'], 'partial topic evidence can qualify without inventing missing interests');
$hardPartial = F::evaluate([F::condition('topics', 'similarity', ['robotics', 'education'], 'hard')], ['topics' => ['robotics']]);
verify(!$hardPartial->qualifies && $hardPartial->diagnostics->hardConflicts === ['topic_similarity:not_satisfied'], 'partial hard condition is not considered satisfied');
$hardUnknown = F::evaluate([$topic, F::condition('needs', 'supply_demand', ['backend'], 'hard')], ['topics' => ['robotics']]);
verify(!$hardUnknown->qualifies && $hardUnknown->diagnostics->hardConflicts === ['contribution_supply:unknown'], 'unknown hard contribution blocks despite strong topic evidence');
$none = F::evaluate([$topic], ['topics' => ['different']]);
near($none->diagnostics->matchScore, 0.0, 'known disjoint topic set scores zero');
verify(!$none->qualifies && $none->diagnostics->evidenceCoverage === 1.0, 'known conflict and unknown absence are distinct');

$skillOnly = F::evaluate([$need], ['skills' => ['backend']]);
verify(!$skillOnly->qualifies && $skillOnly->diagnostics->unknowns === ['needs'], 'capability does not imply this-event contribution willingness');
$offer = F::evaluate([$need], ['offers' => ['backend']]);
near($offer->diagnostics->matchScore, 1.0, 'explicit event contribution satisfies demand');
verify($offer->qualifies && $offer->diagnostics->diversityKeys === ['contribution:backend'], 'declared contribution has its own positive evidence');
$skills = F::evaluate([F::condition('skills', 'similarity', ['backend'])], ['skills' => ['backend']]);
verify($skills->qualifies && !str_contains($skills->reasons[0]->description, '愿意'), 'explicit skill similarity does not claim willingness');
$gap = F::condition('gaps', 'coverage_gain', ['backend', 'commercial']);
$gapPartial = F::evaluate([$gap], ['offers' => ['backend', 'backend']]);
near($gapPartial->diagnostics->matchScore, .5, 'duplicate offered role does not fill another project gap');
verify($gapPartial->diagnostics->diversityKeys === ['contribution:backend'], 'coverage gain cites only explicitly filled gaps');
near(F::evaluate([$gap], ['offers' => ['coordination']])->diagnostics->matchScore, 0.0, 'different role without requested coverage earns no complementarity score');
$duplicateContribution = F::evaluate([$need, F::condition('gaps', 'coverage_gain', ['backend'])], ['offers' => ['backend']]);
verify(count($duplicateContribution->diagnostics->ruleOutcomes) === 1 && count($duplicateContribution->reasons) === 1, 'same supply and gap fact is not counted twice');

$pref = F::evaluate([F::condition('preferences', 'explicit_preference', ['async', 'sync'])], ['preferences' => ['async']]);
near($pref->diagnostics->matchScore, 1.0, 'explicit preference values form an acceptable set');
verify(!$pref->qualifies && $pref->diagnostics->diversityKeys === [], 'style alone cannot substitute for positive topic or contribution evidence');
$type = F::evaluate([F::condition('self_type', 'explicit_preference', ['INTJ'])], ['self_type' => 'INTJ']);
near($type->diagnostics->matchScore, 1.0, 'self-reported type only follows explicit preference');
verify(!$type->qualifies && $type->diagnostics->diversityKeys === [], 'personality type never becomes leadership or topical diversity evidence');
$params = F::parameters(); $params['rules'][5]['aliases'] = ['ENFP' => 'INTJ'];
rejects(fn() => F::evaluate([$topic], ['topics' => ['robotics']], $params), 'policy cannot invent a personality compatibility table');

$params = F::parameters(); $params['rules'][0]['aliases'] = ['ml' => 'machine_learning', '机器学习' => 'machine_learning'];
$alias = F::evaluate([F::condition('topics', 'similarity', ['ML', 'machine_learning', '机器学习'])], ['topics' => ['机器学习']], $params);
near($alias->diagnostics->matchScore, 1.0, 'explicit whitelisted aliases normalize duplicate requested concepts');
verify($alias->diagnostics->diversityKeys === ['topic:machine_learning'], 'alias diversity keys are deduplicated canonical values');
near(F::evaluate([F::condition('topics', 'similarity', ['artificial_intelligence'])], ['topics' => ['machine_learning']])->diagnostics->matchScore, 0.0, 'unconfigured synonyms are not inferred');
$params = F::parameters(); $params['rules'][0]['aliases'] = ['a' => 'b', 'b' => 'c'];
rejects(fn() => F::evaluate([$topic], ['topics' => ['robotics']], $params), 'alias chains are rejected');
$params = F::parameters(); $params['bindings']['topics']['semantic'] = 'confirmed_text';
$text = F::evaluate([$topic], ['topics' => 'I do not like robotics.'], $params);
near($text->diagnostics->matchScore, 0.0, 'free text substring cannot ignore negation or invent semantic interest');
near(F::evaluate([$topic], ['topics' => 'robotics'], $params)->diagnostics->matchScore, 1.0, 'confirmed text entry can match its explicit literal value');
$numeric = F::evaluate([F::condition('topics', 'similarity', ['2026'])], ['topics' => ['2026']]);
verify($numeric->qualifies && $numeric->diagnostics->diversityKeys === ['topic:2026'], 'numeric-looking tokens stay strings through deduplication');

$utc = F::evaluate([$time], ['availability' => [F::interval('2026-11-11T08:00:00+08:00', '2026-11-11T10:00:00+08:00')]]);
near($utc->diagnostics->matchScore, 1.0, 'equivalent explicit timezone offsets fully cover a time window');
$adjacent = [F::interval('2026-11-11T00:00:00Z', '2026-11-11T01:00:00Z'), F::interval('2026-11-11T01:00:00Z', '2026-11-11T02:00:00Z')];
near(F::evaluate([$time], ['availability' => $adjacent])->diagnostics->matchScore, 1.0, 'adjacent declared intervals can cover the complete request');
$partialTime = [F::interval('2026-11-11T00:00:00Z', '2026-11-11T01:00:00Z')];
near(F::evaluate([$time], ['availability' => $partialTime])->diagnostics->matchScore, .5, 'partial time overlap is not full availability');
$hardTime = F::evaluate([$topic, F::condition('availability', 'interval_overlap', [F::interval()], 'hard')], ['topics' => ['robotics'], 'availability' => $partialTime]);
verify(!$hardTime->qualifies && $hardTime->diagnostics->hardConflicts === ['availability_overlap:not_satisfied'], 'partial time overlap fails a hard full-window requirement');
$gapped = [F::interval('2026-11-11T00:00:00Z', '2026-11-11T00:30:00Z'), F::interval('2026-11-11T01:30:00Z', '2026-11-11T02:00:00Z')];
near(F::evaluate([$time], ['availability' => [...$gapped, ...$gapped]])->diagnostics->matchScore, .5, 'duplicate time intervals do not fill an actual gap');
near(F::evaluate([$time], ['availability' => [F::interval('2026-11-11T02:00:00Z', '2026-11-11T03:00:00Z')]])->diagnostics->matchScore, 0.0, 'touching endpoint alone is not positive overlap');
rejects(fn() => F::evaluate([F::condition('availability', 'interval_overlap', [F::interval('2026-02-31T00:00:00Z', '2026-03-04T02:00:00Z')])], []), 'invalid calendar date is not silently normalized');
rejects(fn() => F::evaluate([F::condition('availability', 'interval_overlap', [F::interval('2026-11-11T00:00:00', '2026-11-11T02:00:00')])], []), 'time endpoint without timezone is rejected');
rejects(fn() => F::evaluate([F::condition('availability', 'interval_overlap', [F::interval('2026-11-11T00:00:00+14:30', '2026-11-11T02:00:00+14:30')])], []), 'timezone offsets beyond fourteen hours are rejected');
rejects(fn() => F::evaluate([F::condition('availability', 'interval_overlap', [F::interval('2026-11-11T02:00:00Z', '2026-11-11T00:00:00Z')])], []), 'reversed availability interval is rejected');

$fullKnown = ['topics' => ['robotics'], 'offers' => ['other'], 'availability' => [F::interval('2026-11-11T03:00:00Z', '2026-11-11T04:00:00Z')], 'preferences' => ['sync']];
$threshold = F::evaluate($all, $fullKnown);
near($threshold->diagnostics->matchScore, .35, 'four-dimension match can equal the initial threshold exactly');
verify($threshold->qualifies, 'score equal to .35 with positive topic evidence qualifies');
$params = F::parameters(); $params['minimum_match_score'] = .7;
$below = F::evaluate([F::condition('topics', 'similarity', ['robotics', 'education'])], ['topics' => ['robotics']], $params, ['structured' => 1, 'fulltext' => 1]);
verify(!$below->qualifies && $below->diagnostics->insufficiency === 'below_threshold', 'high recall ranking cannot override the match threshold');
near(F::evaluate([$topic], ['topics' => ['robotics']], null, ['fulltext' => 1])->diagnostics->rrfScore, 1 / 3, 'missing route contributes zero without per-candidate route renormalization');
$params = F::parameters(); $params['enabled_routes'][] = 'semantic';
near(F::evaluate([$topic], ['topics' => ['robotics']], $params, ['structured' => 1])->diagnostics->rrfScore, .4, 'enabled semantic route stays in the common denominator even when this candidate misses it');
near(F::evaluate([$topic], ['topics' => ['robotics']], null, ['structured' => 2, 'fulltext' => 3])->diagnostics->rrfScore, (2 / 3) * 61 / 62 + (1 / 3) * 61 / 63, 'RRF uses exact one-based rank formula');
rejects(fn() => F::evaluate([$topic], ['topics' => ['robotics']], null, ['semantic' => 1]), 'disabled route cannot sneak into scoring');
rejects(fn() => F::evaluate([$topic], ['topics' => ['robotics']], null, ['structured' => 0]), 'zero recall rank rejected');
rejects(fn() => F::evaluate([$topic], ['topics' => ['robotics']], null, ['fulltext' => 41]), 'recall rank beyond route budget rejected');

$twoTopics = [$topic, F::condition('topics', 'similarity', ['education'])];
$oneCopy = F::evaluate($twoTopics, ['topics' => ['robotics']]);
$manyCopies = F::evaluate([...$twoTopics, ...array_fill(0, 10, $topic)], ['topics' => ['robotics']]);
near($oneCopy->diagnostics->matchScore, .5, 'mixed distinct requirements aggregate to a partial dimension');
near($oneCopy->sortScore, $manyCopies->sortScore, 'repeated conditions do not amplify a matching fact');
verify(count($manyCopies->diagnostics->ruleOutcomes) === 2, 'equivalent repeated requirements are evaluated once');
$params = F::parameters();
$params['bindings']['topics_aux'] = $params['bindings']['topics']; $params['bindings']['topics_aux']['source_key'] = 'synthetic_topics_aux';
$params['rules'][0]['id'] = 'a_missing';
$extra = $params['rules'][0]; $extra['id'] = 'b_present'; $extra['query_feature'] = 'topics_again'; $extra['candidate_features'] = ['topics_aux']; $params['rules'][] = $extra;
$separate = F::evaluate([$topic, F::condition('topics_again', 'similarity', ['robotics'])], ['topics_aux' => ['robotics']], $params);
verify(count($separate->diagnostics->ruleOutcomes) === 2 && $separate->reasons[0]->ruleId === 'b_present', 'distinct declared sources retain separate requirements and correct evidence attribution');
near($separate->diagnostics->matchScore, .5, 'a matching independent source does not complete an unknown requirement');
near($separate->diagnostics->evidenceCoverage, .5, 'an independent missing source remains missing in evidence coverage');
$params = F::parameters();
$params['bindings']['work_style'] = $params['bindings']['preferences']; $params['bindings']['work_style']['source_key'] = 'synthetic_work_style';
$extra = $params['rules'][4]; $extra['id'] = 'work_style_explicit'; $extra['query_feature'] = 'work_style'; $extra['candidate_features'] = ['work_style']; $params['rules'][] = $extra;
$independentConditions = [$topic, F::condition('preferences', 'explicit_preference', ['structured'], 'hard'), F::condition('work_style', 'explicit_preference', ['structured'])];
$independent = F::evaluate($independentConditions, ['topics' => ['robotics'], 'work_style' => ['structured']], $params);
verify(!$independent->qualifies && $independent->diagnostics->hardConflicts === ['style_explicit:unknown'], 'soft work style cannot satisfy a different unknown hard preference');
verify($independent->diagnostics->unknowns === ['preferences'], 'independent unknown preference remains visible');
near($independent->diagnostics->matchScore, .85, 'independent style requirements do not merge merely because requested values agree');
near($independent->diagnostics->evidenceCoverage, .85, 'independent known source cannot erase another source absence');
$conflicting = F::evaluate($independentConditions, ['topics' => ['robotics'], 'preferences' => ['flexible'], 'work_style' => ['structured']], $params);
verify(!$conflicting->qualifies && $conflicting->diagnostics->hardConflicts === ['style_explicit:not_satisfied'], 'soft source cannot override a conflicting hard source');
$params = F::parameters();
$extra = $params['rules'][0]; $extra['id'] = 'topic_with_alias'; $extra['query_feature'] = 'topic_alias'; $extra['aliases'] = ['mechanics' => 'robotics']; $params['rules'][] = $extra;
$aliasHard = F::evaluate([F::condition('topics', 'similarity', ['robotics'], 'hard'), F::condition('topic_alias', 'similarity', ['robotics'])], ['topics' => ['mechanics']], $params);
verify(!$aliasHard->qualifies && $aliasHard->diagnostics->hardConflicts === ['topic_similarity:not_satisfied'], 'another rule alias cannot rewrite an original hard condition');
verify(count($aliasHard->diagnostics->ruleOutcomes) === 2, 'different alias semantics remain distinct scoring requirements');
$equivalentHard = F::evaluate([F::condition('needs', 'supply_demand', ['backend'], 'hard'), F::condition('gaps', 'coverage_gain', ['backend'])], []);
verify($equivalentHard->diagnostics->hardConflicts === ['contribution_supply:unknown'], 'deduplicated hard and soft equivalent facts report only the original hard conflict');

$engine = new DeterministicRuleEvaluator(); $policy = new RulePolicy('fixture-policy', F::parameters());
rejects(fn() => $engine->validateQuery(new QueryIntent('person', [F::condition('topics', 'execute_sql', ['robotics'])]), $policy), 'unknown operator is rejected before candidate evaluation');
rejects(fn() => $engine->validateQuery(new QueryIntent('person', [F::condition('unmapped', 'similarity', ['robotics'])]), $policy), 'unknown query feature is rejected before candidate evaluation');
rejects(fn() => $engine->validateQuery(new QueryIntent('person', [F::condition('topics', 'similarity', [])]), $policy), 'empty active condition is rejected');
rejects(fn() => $engine->validateQuery(new QueryIntent('person', [F::condition('topics', 'similarity', ['sql' => 'arbitrary'])]), $policy), 'token condition cannot carry an arbitrary object');
rejects(fn() => $engine->validateQuery(new QueryIntent('person', [$topic], ['self-field']), $policy), 'unparsed self-field input remains rejected');
rejects(fn() => $engine->validateQuery(new QueryIntent('person', [$topic], [], 'private-idea'), $policy), 'unparsed idea context remains rejected');
rejects(fn() => F::evaluate([$topic], ['topics' => ['invalid' => 'shape']]), 'malformed projected feature does not become neutral unknown', UnexpectedValueException::class);
rejects(fn() => $engine->evaluate(F::context(), new QueryIntent('person', [$need]), F::candidate(['offers' => ['backend']], null, ['offers' => 'global']), $policy, ['structured' => 1]), 'declared event contribution cannot use global evidence', UnexpectedValueException::class);
rejects(fn() => $engine->evaluate(new CurrentEventContext(1, 8, 'v', 'p'), new QueryIntent('person', [$topic]), F::candidate(['topics' => ['robotics']]), $policy, ['structured' => 1]), 'candidate Space must match evaluation context');
rejects(fn() => $engine->evaluate(F::context(), new QueryIntent('person', [$topic]), F::candidate(['topics' => ['robotics']], null, [], '1'), $policy, ['structured' => 1]), 'viewer cannot be their own recommended candidate');
$params = F::parameters(); $params['rules'][2]['candidate_features'] = ['skills'];
rejects(fn() => F::evaluate([$need], ['skills' => ['backend']], $params), 'policy cannot recast capability as willing contribution');
verify((new RuleAssessment(false, 0.0))->diagnostics === null, 'legacy three-argument RuleAssessment remains compatible');

echo json_encode(['status' => 'passed', 'phase' => 'R2 deterministic rules over synthetic authorized projections', 'evaluator_version' => DeterministicRuleEvaluator::VERSION, 'checks' => count($checks), 'database_calls' => 0, 'network_calls' => 0, 'model_calls' => 0, 'production_adapters_executed' => false, 'checks_passed' => $checks], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;
