<?php
declare(strict_types=1);
namespace humhub\modules\matcherRecommendation\contracts\ports;

interface ProfileFieldCatalog
{
    /**
     * Versioned P1 metadata, never profile values or native table/column requirements.
     * @return array{schema_version:int,fields:array<string,array{key:string,scope:string,value_schema:array,cardinality:string}>}
     * New source keys are unmapped by default. The separate purpose allowlist is not inferred from kind/visibility.
     */
    public function read(): array;
}
