<?php
declare(strict_types=1);
/** Pure-domain counterpart, separately labelled from actual MySQL/HTTP acceptance. */
require dirname(__DIR__).'/domain/browse/DiscoveryException.php';
require dirname(__DIR__).'/domain/browse/OrdinaryDiscoveryQuery.php';
use humhub\modules\matcherRecommendation\domain\browse\OrdinaryDiscoveryQuery;
$input=json_decode(stream_get_contents(STDIN),true,512,JSON_THROW_ON_ERROR);
$output=[];
foreach($input['cases'] as $case) {
    $query=new OrdinaryDiscoveryQuery($case['filters'],'relevance',48);$matches=[];
    foreach($input['cards'] as $card) { $score=$query->match($card);if($score!==null)$matches[]=['id'=>$card['owner_id'],'score'=>$score]; }
    usort($matches,static fn(array $a,array $b):int=>($b['score']<=>$a['score'])?:($b['id']<=>$a['id']));
    $output[$case['name']]=array_column($matches,'id');
}
echo json_encode($output,JSON_THROW_ON_ERROR),PHP_EOL;
