<?php
return [
    'id' => 'comparison-native',
    'class' => humhub\modules\comparisonNative\Module::class,
    'namespace' => 'humhub\modules\comparisonNative',
    'urlManagerRules' => [
        'comparison-native' => 'comparison-native/home/index',
    ],
];
