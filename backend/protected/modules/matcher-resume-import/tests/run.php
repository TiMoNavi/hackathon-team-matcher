<?php
declare(strict_types=1);
$root = dirname(__DIR__);
$fixture = realpath($argv[1] ?? '') ?: '';
if (!is_dir($fixture)) { fwrite(STDERR, 'Pass a generated synthetic fixture directory.' . PHP_EOL); exit(2); }
spl_autoload_register(static function (string $class) use ($root): void {
    foreach (['humhub\\modules\\matcherResumeImport\\' => $root, 'humhub\\modules\\matcherProfile\\' => dirname($root) . '/matcher-user-profile'] as $prefix => $directory) {
        if (str_starts_with($class, $prefix)) { $path = $directory . '/' . str_replace(chr(92), '/', substr($class, strlen($prefix))) . '.php'; if (is_file($path)) { require $path; } }
    }
});
use humhub\modules\matcherResumeImport\application\ResumeSourceReader;
use humhub\modules\matcherResumeImport\adapters\parser\PythonDocumentParser;
use humhub\modules\matcherResumeImport\domain\ResumeCandidateMapper;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherProfile\domain\FieldCatalog;
$checks = [];
function check(bool $value, string $label): void { global $checks; if (!$value) { throw new RuntimeException($label); } $checks[] = $label; }
function reject(callable $action, string $code, string $label): void { try { $action(); } catch (ProfileException $e) { check($e->errorCode === $code, $label); return; } throw new RuntimeException($label); }
$parser = new PythonDocumentParser(dirname($root, 3) . '/.runtime/resume-python/bin/python3', $root . '/runtime/parse_document.py');
$reader = new ResumeSourceReader($parser);
$input = static function (string $filename) use ($fixture): array { $path = $fixture . '/' . $filename; return ['tmp_path' => $path, 'filename' => $filename, 'mime' => 'application/octet-stream', 'size' => filesize($path)]; };
try {
    check($reader->kind() === 'resume', 'independent_resume_reader_kind');
    $status = $reader->status(1); check($status['available'] && $status['max_bytes'] === 5242880 && $status['max_pages'] === 30, 'local_capabilities_and_limits');
    reject(fn() => $reader->status(0), 'AUTHENTICATION_REQUIRED', 'anonymous_status_rejected');
    foreach (['txt', 'md', 'pdf', 'docx'] as $format) {
        $data = $reader->read(1, $input('synthetic.' . $format));
        check(str_contains($data['raw_text'], '合成测试者') && str_contains($data['raw_text'], 'TypeScript'), $format . '_real_chinese_english_text');
        check(count($data['sections']) > 0 && $data['sections'][0]['locator']['format'] === $format, $format . '_located_paragraphs');
        $ids = array_column($data['sections'], 'id');
        check(array_filter($data['candidates'], static fn(array $c): bool => FieldCatalog::validate($c['key'], $c['value']) !== [] || array_diff($c['evidence'], $ids) !== []) === [], $format . '_valid_candidates_with_real_evidence');
        $keys = array_column($data['candidates'], 'key');
        check(in_array('real_name', $keys, true) && in_array('education', $keys, true) && in_array('project', $keys, true) && in_array('work_experience', $keys, true) && in_array('award', $keys, true), $format . '_explicit_facts_mapped');
        check($data['metadata']['llm_calls'] === 0 && $data['metadata']['network_requests'] === 0 && !$data['metadata']['binary_retained'], $format . '_zero_network_models_no_binary_copy');
        check($data['external_id'] === 'sha256:' . hash_file('sha256', $fixture . '/synthetic.' . $format), $format . '_content_addressed_source');
        if ($format === 'pdf') { check($data['metadata']['page_count'] === 1 && !$data['metadata']['ocr_used'], 'pdf_text_extraction_without_ocr'); }
        if ($format === 'docx') { check(!$data['metadata']['external_relationships_fetched'], 'docx_external_relationship_never_fetched'); }
    }
    $first = $reader->read(1, $input('synthetic.txt')); $again = $reader->read(1, $input('synthetic.txt'));
    check($first === $again, 'same_document_has_stable_candidates_sections_and_hash');
    $utf16 = $reader->read(1, $input('synthetic-utf16.txt'));
    check($utf16['raw_text'] === $first['raw_text'], 'utf16_bom_preserves_chinese');
    $mapped = (new ResumeCandidateMapper())->map([['id' => 's1', 'text' => 'Free-form text that does not claim any personal fact.']]);
    check($mapped === [], 'unlabelled_prose_does_not_become_invented_profile');
    $mapped = (new ResumeCandidateMapper())->map([['id' => 's1', 'text' => "技能：Python, Python\nEmail: invalid\nMBTI: UNKNOWN"]]);
    check(count($mapped) === 1 && $mapped[0]['key'] === 'skill', 'duplicates_and_invalid_facts_not_proposed');
    $mapped = (new ResumeCandidateMapper())->map([['id' => 's1', 'text' => 'Name: Alice'], ['id' => 's2', 'text' => 'Name: Alice']]);
    check(count($mapped) === 1 && $mapped[0]['evidence'] === ['s1', 's2'], 'duplicate_evidence_is_combined');
    $mapper = new ResumeCandidateMapper();
    $education = $mapper->map([['id' => 'edu', 'text' => "School: Synthetic University\nMajor: Computing\nSummary: Studied distributed systems."]]);
    check(count($education) === 1 && $education[0]['key'] === 'education' && ($education[0]['value']['summary'] ?? null) === 'Studied distributed systems.', 'english_education_summary_stays_in_education');
    $work = $mapper->map([['id' => 'work', 'text' => "Company: Synthetic Lab\nPosition: Engineer\nSummary: Built import tools."]]);
    check(count($work) === 1 && $work[0]['key'] === 'work_experience' && ($work[0]['value']['summary'] ?? null) === 'Built import tools.', 'english_work_summary_stays_in_work_experience');
    $bio = $mapper->map([['id' => 'bio', 'text' => 'Summary: I enjoy building practical tools.']]);
    check(count($bio) === 1 && $bio[0]['key'] === 'bio' && $bio[0]['value'] === 'I enjoy building practical tools.', 'standalone_personal_summary_maps_to_bio');
    $englishText = "Name: Synthetic English\nSummary: Personal introduction.\nSchool: Synthetic University\nSummary: Studied computing.\nCompany: Synthetic Lab\nPosition: Engineer\nSummary: Built tools.\n";
    file_put_contents($fixture . '/english-context.txt', $englishText);
    try {
        $english = $reader->read(1, $input('english-context.txt'));
        check($english['raw_text'] === $englishText && count(array_filter($english['candidates'], static fn(array $c): bool => $c['key'] === 'bio')) === 1, 'english_summary_context_keeps_source_text_and_single_bio');
    } finally { unlink($fixture . '/english-context.txt'); }
    foreach ([['empty.txt','RESUME_NO_TEXT'],['empty.pdf','RESUME_NO_TEXT'],['encrypted.pdf','RESUME_ENCRYPTED'],['bad-encoding.txt','RESUME_ENCODING_UNSUPPORTED'],['binary.txt','RESUME_INVALID_DOCUMENT'],['broken.pdf','RESUME_INVALID_DOCUMENT'],['spoof.pdf','RESUME_INVALID_DOCUMENT'],['broken.docx','RESUME_INVALID_DOCUMENT'],['traversal.docx','RESUME_INVALID_DOCUMENT'],['entities.docx','RESUME_INVALID_DOCUMENT'],['bomb.docx','RESUME_LIMIT_EXCEEDED'],['text-limit.txt','RESUME_LIMIT_EXCEEDED'],['sections-limit.txt','RESUME_LIMIT_EXCEEDED'],['page-limit.pdf','RESUME_LIMIT_EXCEEDED'],['upload-limit.txt','RESUME_UPLOAD_TOO_LARGE'],['unsupported.html','RESUME_UNSUPPORTED_FORMAT']] as [$file, $code]) { reject(fn() => $reader->read(1, $input($file)), $code, 'reject_' . str_replace('.', '_', $file)); }
    $bad = $input('synthetic.txt'); $bad['size']++;
    reject(fn() => $reader->read(1, $bad), 'INVALID_RESUME_UPLOAD', 'forged_file_size_rejected');
    $bad = $input('synthetic.txt'); $bad['url'] = 'https://example.test/no-fetch';
    reject(fn() => $reader->read(1, $bad), 'INVALID_RESUME_UPLOAD', 'extra_upload_fields_rejected');
    reject(fn() => $reader->read(0, $input('synthetic.txt')), 'AUTHENTICATION_REQUIRED', 'anonymous_import_rejected');
    $traversalName = $input('synthetic.txt'); $traversalName['filename'] = '../hidden/synthetic.txt';
    check($reader->read(1, $traversalName)['label'] === 'synthetic.txt', 'filename_never_exposes_client_path');
    $upper = $input('synthetic.txt'); $upper['filename'] = 'SYNTHETIC.TXT';
    check($reader->read(1, $upper)['metadata']['format'] === 'txt', 'extension_is_case_insensitive');
    symlink($fixture . '/synthetic.txt', $fixture . '/synthetic-alias.txt');
    try { reject(fn() => $reader->read(1, $input('synthetic-alias.txt')), 'INVALID_RESUME_UPLOAD', 'symlink_upload_rejected'); } finally { unlink($fixture . '/synthetic-alias.txt'); }
    $timeout = new PythonDocumentParser(dirname($root, 3) . '/.runtime/resume-python/bin/python3', $root . '/runtime/parse_document.py', 0.0001);
    reject(fn() => $timeout->parse($fixture . '/synthetic.txt', 'txt'), 'RESUME_PARSE_TIMEOUT', 'parser_wall_timeout_is_enforced');
    $missing = new PythonDocumentParser('/nonexistent/python', $root . '/runtime/parse_document.py');
    check(!$missing->available(), 'missing_runtime_not_available');
    reject(fn() => $missing->parse($fixture . '/synthetic.txt', 'txt'), 'RESUME_PARSER_UNAVAILABLE', 'missing_runtime_has_explicit_error');
    echo json_encode(['status' => 'passed', 'passed' => count($checks), 'checks' => $checks, 'llm_calls' => 0, 'network_requests' => 0, 'synthetic_only' => true], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
} catch (Throwable $e) { echo json_encode(['status' => 'failed', 'completed' => count($checks), 'failed_check' => $e->getMessage()], JSON_UNESCAPED_SLASHES) . PHP_EOL; exit(1); }
