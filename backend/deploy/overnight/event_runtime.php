<?php
declare(strict_types=1);

/** Configure the module request boundary before native POST consumers run. */
function overnightEventAccessWebBootstrap(array $bootstrap): array
{
    $autoload = 'humhub\components\bootstrap\ModuleAutoLoader';
    $language = 'humhub\components\bootstrap\LanguageSelector';
    $boundary = 'humhub\modules\matcherEventAccess\adapters\http\EventAccessRequestBootstrap';
    $bootstrap = array_values($bootstrap);
    $loaderIndex = array_search($autoload, $bootstrap, true);
    $languageIndex = array_search($language, $bootstrap, true);
    if ($loaderIndex === false || $languageIndex === false || $loaderIndex >= $languageIndex
        || count(array_keys($bootstrap, $autoload, true)) !== 1 || count(array_keys($bootstrap, $language, true)) !== 1) {
        throw new RuntimeException('Activity bootstrap order refused.');
    }
    $boundaryIndex = array_search($boundary, $bootstrap, true);
    if ($boundaryIndex !== false) {
        if ($boundaryIndex <= $loaderIndex || $boundaryIndex >= $languageIndex || count(array_keys($bootstrap, $boundary, true)) !== 1) {
            throw new RuntimeException('Activity bootstrap boundary refused.');
        }
        return $bootstrap;
    }
    array_splice($bootstrap, $languageIndex, 0, [$boundary]);
    return $bootstrap;
}
