<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;
interface ConversationProvider
{
    /** {action:clarify|search|discuss,message:string,conditions:list<QueryIntent condition>} */
    public function plan(#[\SensitiveParameter] array $input, #[\SensitiveParameter] string $permit): array;
    /** {message:string,items:list<{id:string,fact_ids:list<string>,reason:string,gaps:list<string>}>} */
    public function respond(#[\SensitiveParameter] array $input, #[\SensitiveParameter] string $permit): array;
}
