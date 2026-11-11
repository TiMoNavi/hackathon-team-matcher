<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherWebImport\adapters\network\CurlHttpTransport;
use humhub\modules\matcherWebImport\adapters\network\ProcessDnsResolver;
use humhub\modules\matcherWebImport\adapters\parser\NativeWebDocumentParser;
use humhub\modules\matcherWebImport\application\BoundedWebFetcher;
// Fixed public synthetic/example page. No owner association, database writes or custom input.
try {
    $download = (new BoundedWebFetcher(new ProcessDnsResolver(),new CurlHttpTransport()))->fetch('https://example.com/');
    $parsed = (new NativeWebDocumentParser())->parse($download['body'],$download['content_type']);
    echo json_encode(['status'=>'passed','target'=>'https://example.com/','final_url'=>$download['final_url'],
        'network_requests'=>$download['network_requests'],'downloaded_bytes'=>$download['downloaded_bytes'],
        'elapsed_ms'=>$download['elapsed_ms'],'text_bytes'=>strlen($parsed['raw_text']),'sections'=>count($parsed['sections']),
        'body_sha256'=>hash('sha256',$download['body']),'llm_calls'=>0,'profile_written'=>false],JSON_UNESCAPED_SLASHES|JSON_PRETTY_PRINT).PHP_EOL;
} catch (ProfileException $error) { echo json_encode(['status'=>'failed','error_code'=>$error->errorCode,'target'=>'https://example.com/']).PHP_EOL; exit(1); }
