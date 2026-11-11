<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

use humhub\modules\matcherProfile\domain\FieldCatalog;
use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherWebImport\adapters\network\CurlHttpTransport;
use humhub\modules\matcherWebImport\adapters\network\ProcessDnsResolver;
use humhub\modules\matcherWebImport\adapters\parser\NativeWebDocumentParser;
use humhub\modules\matcherWebImport\application\BoundedWebFetcher;
use humhub\modules\matcherWebImport\application\TextSourceReader;
use humhub\modules\matcherWebImport\application\WebSourceReader;
use humhub\modules\matcherWebImport\domain\PublicAddressPolicy;
use humhub\modules\matcherWebImport\domain\TextStructure;
use humhub\modules\matcherWebImport\domain\WebLimits;
use humhub\modules\matcherWebImport\domain\WebUrl;
use humhub\modules\matcherWebImport\domain\ports\DnsResolver;
use humhub\modules\matcherWebImport\domain\ports\HttpTransport;

final class FixtureDns implements DnsResolver
{
    public array $calls = [];
    public function __construct(public array $answers = ['93.184.216.34'], public ?\Closure $hook = null) {}
    public function resolve(string $host, int $timeoutMs): array
    { $this->calls[] = [$host, $timeoutMs]; if ($this->hook) { ($this->hook)($host); } return $this->answers; }
}
final class FixtureHttp implements HttpTransport
{
    public array $calls = [];
    public function __construct(public array $responses, public ?\Closure $hook = null) {}
    public function get(string $url, string $ip, int $timeoutMs, int $maxBytes): array
    { $this->calls[] = compact('url','ip','timeoutMs','maxBytes'); if ($this->hook) { ($this->hook)($url); } return array_shift($this->responses); }
}

$checks = [];
function check(bool $condition, string $label): void { global $checks; if (!$condition) { throw new \RuntimeException($label); } $checks[] = $label; }
function reject(callable $call, string $code, string $label): void
{ try { $call(); } catch (ProfileException $error) { check($error->errorCode === $code, $label . ' expected ' . $code . ' received ' . $error->errorCode); return; } throw new \RuntimeException($label . ' was accepted'); }
function response(string $body, int $status = 200, array $headers = []): array
{ return ['status' => $status, 'headers' => $headers + ['content-type' => 'text/html; charset=UTF-8'], 'body' => $body]; }

try {
    $text = new TextSourceReader();
    $source = "姓名：合成测试者\r\n技能：PHP, Python\r项目：合成导入器\n角色：后端\n贡献：设计有界导入\nThis paragraph is unlabelled.\n";
    $input = ['text' => $source, 'label' => '测试资料', 'ownership' => 'self'];
    check($text->kind() === 'text' && $text->status(1)['available'], 'text_local_capability');
    $read = $text->read(1, $input);
    $normalized = str_replace(["\r\n","\r"], "\n", $source);
    check($read['raw_text'] === $normalized && $read['canonical_url'] === null, 'text_preserves_unicode_and_lines');
    check($read['external_id'] === 'text:' . hash('sha256', $normalized), 'text_hash_uses_normalized_content');
    check($text->identify(1, ['text' => "\xEF\xBB\xBF" . $normalized, 'ownership' => 'self'])['external_id'] === $read['external_id'], 'bom_and_newline_identity_stable');
    check($text->identify(1, ['text' => $normalized . 'changed', 'ownership' => 'self'])['external_id'] !== $read['external_id'], 'changed_text_is_new_identity');
    check($read['metadata']['network_requests'] === 0 && $read['metadata']['llm_calls'] === 0 && $read['metadata']['ownership_basis'] === 'self_declared', 'text_is_local_rules_and_self_declared');
    $ids = array_column($read['sections'], 'id');
    check(array_filter($read['candidates'], static fn(array $c): bool => FieldCatalog::validate($c['key'], $c['value']) !== [] || array_diff($c['evidence'], $ids) !== []) === [], 'text_candidates_valid_and_evidenced');
    check(in_array('project', array_column($read['candidates'], 'key'), true) && count($read['candidates']) === 4, 'only_explicit_facts_become_candidates');
    check($text->read(1, $input) === $read, 'text_stable_sections_and_candidate_ids');
    check($text->read(1, ['text' => 'Some unlabelled original text.', 'ownership' => 'self'])['candidates'] === [], 'unlabelled_prose_remains_source');
    foreach ([['text' => 'x'], ['text' => 'x','ownership' => 'other']] as $bad) { reject(fn() => $text->identify(1, $bad), 'SOURCE_OWNERSHIP_REQUIRED', 'text_explicit_ownership_required'); }
    reject(fn() => $text->read(0, $input), 'AUTHENTICATION_REQUIRED', 'text_owner_required');
    reject(fn() => $text->identify(1, $input + ['owner_id' => 2]), 'INVALID_TEXT_INPUT', 'text_rejects_client_owner');
    reject(fn() => $text->identify(1, ['text' => [],'ownership' => 'self']), 'INVALID_TEXT_INPUT', 'text_requires_string');
    reject(fn() => $text->identify(1, ['text' => "bad\0binary",'ownership' => 'self']), 'SOURCE_TEXT_INVALID', 'text_binary_rejected');
    reject(fn() => $text->identify(1, ['text' => "\xFF",'ownership' => 'self']), 'SOURCE_TEXT_INVALID', 'text_invalid_utf8_rejected');
    reject(fn() => $text->identify(1, ['text' => " \n\t",'ownership' => 'self']), 'SOURCE_NO_TEXT', 'text_blank_rejected');
    reject(fn() => $text->identify(1, ['text' => str_repeat('x',WebLimits::PASTE_BYTES+1),'ownership' => 'self']), 'SOURCE_TEXT_TOO_LARGE', 'text_size_enforced');
    reject(fn() => $text->identify(1, ['text' => 'x','label' => "bad\nlabel",'ownership' => 'self']), 'INVALID_TEXT_LABEL', 'text_label_controls_rejected');
    reject(fn() => $text->identify(1, ['text' => 'x','label' => str_repeat('字',161),'ownership' => 'self']), 'INVALID_TEXT_LABEL', 'text_label_length_enforced');
    reject(fn() => TextStructure::build(str_repeat("x\n",2001),'text'), 'SOURCE_SECTION_LIMIT', 'section_count_enforced');
    $long = TextStructure::build(str_repeat('字',10000),'text');
    check(count($long['sections']) === 2 && implode('',array_column($long['sections'],'text')) === $long['raw_text'] && mb_check_encoding($long['sections'][0]['text'],'UTF-8'), 'long_unicode_line_chunks_without_loss');

    check(WebUrl::normalize('HTTPS://Example.COM:443/a/../profile#part') === 'https://example.com/profile', 'url_normalizes_scheme_host_port_fragment');
    check(WebUrl::normalize('https://example.com') === 'https://example.com/', 'url_root_is_stable');
    check(WebUrl::resolve('https://example.com/a/b','../c?x=1') === 'https://example.com/c?x=1', 'relative_redirect_resolves');
    check(WebUrl::resolve('https://example.com/a?x=1','?x=2') === 'https://example.com/a?x=2', 'query_redirect_resolves');
    foreach (['file:///etc/passwd','ftp://example.com/a','https://user:secret@example.com','https://127.0.0.1/','http://2130706433/','http://0177.0.0.1/','http://0x7f000001/','http://0x7f.0.0.1/','http://[::1]/','http://localhost/','http://host.local/','http://host.home.arpa/','http://example.com:8080/','http://example.com:443/','https://example.com:80/','http://example.com./','http://%31%32%37.0.0.1/','http://example.com/%0d%0aX:evil','http://example.com/ bad','http://example.com/\\evil','http://例子.com/','http://example.com/%xx'] as $bad) {
        reject(fn() => WebUrl::normalize($bad), 'INVALID_WEB_URL', 'reject_url_' . hash('crc32b',$bad));
    }
    foreach (['0.0.0.0','10.0.0.1','100.64.0.1','127.0.0.1','169.254.169.254','172.16.0.1','192.0.0.9','192.0.2.1','192.88.99.1','192.168.1.1','198.18.0.1','198.51.100.1','203.0.113.1','224.0.0.1','240.0.0.1','255.255.255.255','::','::1','::ffff:8.8.8.8','64:ff9b::808:808','64:ff9b:1::1','fc00::1','fe80::1','ff02::1','2001::1','2001:20::1','2001:db8::1','2002:0808:0808::1','3fff::1','not-an-ip'] as $bad) {
        reject(fn() => PublicAddressPolicy::assertPublic($bad), 'WEB_TARGET_NOT_PUBLIC', 'reject_ip_' . str_replace(':','_',$bad));
    }
    foreach (['8.8.8.8','1.1.1.1','93.184.216.34','2606:4700::1111','2001:4860:4860::8888'] as $good) { PublicAddressPolicy::assertPublic($good); check(true,'allow_public_' . str_replace(':','_',$good)); }

    $parser = new NativeWebDocumentParser();
    $html = '<!doctype html><html><head><title>合成个人主页</title><style>.x{display:none}</style><script>技能：HIDDEN_JS</script></head><body><nav>技能：HIDDEN_NAV</nav><main><h1>姓名：合成网站者</h1><p>技能：Python, PHP</p><p hidden>技能：HIDDEN_ATTR</p><p aria-hidden="true">技能：HIDDEN_ARIA</p><p style="color:red;display: none !important">技能：HIDDEN_STYLE</p><p>简介：喜欢 &amp; 合作</p><script src="http://127.0.0.1/">技能：HIDDEN_SCRIPT</script><iframe src="http://127.0.0.1/">技能：HIDDEN_FRAME</iframe><pre>项目：合成网页\n角色：后端</pre></main><footer>技能：HIDDEN_FOOTER</footer></body></html>';
    $html = str_replace('网页\n角色',"网页\n角色",$html);
    $parsed = $parser->parse($html,'text/html; charset=UTF-8');
    check(str_contains($parsed['raw_text'],'合成网站者') && str_contains($parsed['raw_text'],'喜欢 & 合作'), 'html_unicode_entities_readable');
    check(!str_contains($parsed['raw_text'],'HIDDEN'), 'html_removes_scripts_hidden_and_chrome');
    check($parsed['metadata']['title'] === '合成个人主页' && !$parsed['metadata']['scripts_executed'] && !$parsed['metadata']['external_resources_loaded'], 'html_metadata_reports_static_extraction');
    check($parsed['sections'][0]['locator']['format'] === 'html', 'html_line_locators');
    $latin = $parser->parse("<html><p>Name: Ren\xE9</p></html>",'text/html; charset=iso-8859-1');
    check(str_contains($latin['raw_text'],'René'), 'charset_header_decodes_latin');
    $gb = mb_convert_encoding('<html><meta charset="GB18030"><p>姓名：中文编码</p></html>','GB18030','UTF-8');
    check(str_contains($parser->parse($gb,'text/html')['raw_text'],'中文编码'), 'charset_meta_decodes_chinese');
    $plain = $parser->parse("姓名：纯文字\n技能：PHP\n",'text/plain');
    check($plain['raw_text'] === "姓名：纯文字\n技能：PHP\n", 'web_plain_text_retains_lines');
    reject(fn() => $parser->parse('PDF','application/pdf'), 'WEB_UNSUPPORTED_MEDIA','binary_media_not_parsed');
    reject(fn() => $parser->parse('text','text/plain; charset=unknown'), 'WEB_CHARSET_UNSUPPORTED','unknown_charset_rejected');
    reject(fn() => $parser->parse("\xFF",'text/plain; charset=UTF-8'), 'WEB_CHARSET_UNSUPPORTED','bad_declared_encoding_rejected');
    reject(fn() => $parser->parse('<html><script>only JS</script></html>','text/html'), 'SOURCE_NO_TEXT','js_only_page_is_explicit_no_text');
    reject(fn() => $parser->parse(str_repeat('x', WebLimits::TEXT_BYTES+1),'text/plain'), 'SOURCE_TEXT_TOO_LARGE','web_text_limit_enforced');
    reject(fn() => $parser->parse(str_repeat('x', WebLimits::BODY_BYTES+1),'text/html'), 'WEB_RESPONSE_TOO_LARGE','web_download_limit_enforced');
    reject(fn() => $parser->parse(str_repeat('<br>',20001),'text/html'), 'WEB_DOCUMENT_LIMIT','html_node_budget_before_dom_parse');
    reject(fn() => $parser->parse('<!DOCTYPE html [<!ENTITY x SYSTEM "file:///synthetic-only">]><html><p>&x;</p></html>','text/html'), 'WEB_DOCUMENT_LIMIT','html_entity_declarations_rejected');

    $dns = new FixtureDns(); $http = new FixtureHttp([response($html)]);
    $web = new WebSourceReader(new BoundedWebFetcher($dns,$http),$parser);
    check($web->status(1)['available'] && $dns->calls === [] && $http->calls === [], 'web_capability_no_remote_io');
    $identified = $web->identify(1,['url'=>'HTTPS://Example.COM:443/me#x','ownership'=>'self']);
    check($identified['canonical_url'] === 'https://example.com/me' && $identified['external_id'] === 'web:'.hash('sha256','https://example.com/me') && $dns->calls === [], 'web_identity_local_normalized_hash');
    $document = $web->read(1,['url'=>'https://example.com/me','ownership'=>'self']);
    check($document['label'] === '合成个人主页' && $document['metadata']['ownership_basis'] === 'self_declared' && $document['metadata']['llm_calls'] === 0, 'web_owner_rules_structured_result');
    check($http->calls[0]['ip'] === '93.184.216.34' && $http->calls[0]['maxBytes'] === WebLimits::BODY_BYTES && $dns->calls[0][1] <= WebLimits::DNS_MS, 'fetcher_supplies_checked_pin_and_budgets');
    reject(fn() => $web->identify(1,['url'=>'https://example.com/me']), 'SOURCE_OWNERSHIP_REQUIRED','web_ownership_required');
    reject(fn() => $web->identify(1,['url'=>'https://example.com/me','ownership'=>'self','token'=>'not-used']), 'INVALID_WEB_INPUT','web_extra_fields_rejected');
    reject(fn() => $web->read(0,['url'=>'https://example.com/me','ownership'=>'self']), 'AUTHENTICATION_REQUIRED','web_owner_required');
    $redirectDns = new FixtureDns(); $redirectHttp = new FixtureHttp([response('',302,['location'=>'../profile']), response('Name: Synthetic Redirect',200,['content-type'=>'text/plain'])]);
    $redirectReader = new WebSourceReader(new BoundedWebFetcher($redirectDns,$redirectHttp),$parser);
    $redirected = $redirectReader->read(1,['url'=>'https://example.com/start/a','ownership'=>'self']);
    check($redirected['canonical_url'] === 'https://example.com/start/a' && $redirected['metadata']['final_url'] === 'https://example.com/profile', 'redirect_preserves_original_identity');
    check(count($redirectDns->calls) === 2 && count($redirectHttp->calls) === 2, 'each_redirect_resolves_and_pins_separately');
    $mixedHttp = new FixtureHttp([]);
    reject(fn() => (new BoundedWebFetcher(new FixtureDns(['93.184.216.34','127.0.0.1']),$mixedHttp))->fetch('https://example.com/'), 'WEB_TARGET_NOT_PUBLIC','mixed_public_private_answers_fail_closed');
    check($mixedHttp->calls === [], 'mixed_dns_performs_no_http');
    $privateRedirect = new FixtureHttp([response('',302,['location'=>'http://169.254.169.254/latest/'])]);
    reject(fn() => (new BoundedWebFetcher(new FixtureDns(),$privateRedirect))->fetch('http://example.com/'), 'INVALID_WEB_URL','redirect_private_ip_never_requested');
    check(count($privateRedirect->calls) === 1, 'unsafe_redirect_stops_before_second_http');
    $reboundDns = new FixtureDns(['93.184.216.34']);
    $reboundHttp = new FixtureHttp([response('',302,['location'=>'/new'])], static function() use ($reboundDns):void { $reboundDns->answers=['10.1.2.3']; });
    reject(fn() => (new BoundedWebFetcher($reboundDns,$reboundHttp))->fetch('https://example.com/'), 'WEB_TARGET_NOT_PUBLIC','same_host_rebinding_rechecked_on_redirect');
    check(count($reboundHttp->calls) === 1,'rebound_address_not_connected');
    reject(fn() => (new BoundedWebFetcher(new FixtureDns(),new FixtureHttp([response('',302,['location'=>'http://example.com/new'])])))->fetch('https://example.com/'), 'WEB_INSECURE_REDIRECT','https_downgrade_blocked');
    reject(fn() => (new BoundedWebFetcher(new FixtureDns(),new FixtureHttp([response('',302,['location'=>'/'])])))->fetch('https://example.com/'), 'WEB_REDIRECT_LOOP','redirect_loop_blocked');
    $chain = []; foreach (range(1,4) as $n) { $chain[] = response('',302,['location'=>'/r'.$n]); }
    reject(fn() => (new BoundedWebFetcher(new FixtureDns(),new FixtureHttp($chain)))->fetch('https://example.com/'), 'WEB_REDIRECT_LIMIT','redirect_count_bounded');
    foreach ([[401,'WEB_ACCESS_DENIED'],[403,'WEB_ACCESS_DENIED'],[404,'WEB_NOT_FOUND'],[500,'WEB_HTTP_FAILED']] as [$status,$code]) { reject(fn() => (new BoundedWebFetcher(new FixtureDns(),new FixtureHttp([response('private',$status)])))->fetch('https://example.com/'),$code,'http_status_'.$status); }
    reject(fn() => (new BoundedWebFetcher(new FixtureDns(),new FixtureHttp([response('gzip',200,['content-encoding'=>'gzip'])])))->fetch('https://example.com/'), 'WEB_UNSUPPORTED_ENCODING','compressed_response_not_silently_processed');
    reject(fn() => (new BoundedWebFetcher(new FixtureDns(),new FixtureHttp([response(str_repeat('a',WebLimits::BODY_BYTES),302,['location'=>'/next']), response('b')])))->fetch('https://example.com/'), 'WEB_RESPONSE_TOO_LARGE','cumulative_redirect_bytes_bounded');
    $clock = 0.0; $slowDns = new FixtureDns(['93.184.216.34'], static function() use (&$clock):void { $clock += WebLimits::TOTAL_MS; });
    $neverHttp = new FixtureHttp([]);
    $slowDnsFetcher = new BoundedWebFetcher($slowDns,$neverHttp,static function() use (&$clock):float{return $clock;});
    reject(fn() => $slowDnsFetcher->fetch('https://example.com/'), 'WEB_TIMEOUT','dns_time_in_total_budget');
    check($neverHttp->calls === [], 'expired_dns_budget_stops_http');
    $clock = 0.0; $slowHttp = new FixtureHttp([response('x')],static function() use (&$clock):void{$clock += WebLimits::TOTAL_MS;});
    $slowHttpFetcher = new BoundedWebFetcher(new FixtureDns(),$slowHttp,static function() use (&$clock):float{return $clock;});
    reject(fn() => $slowHttpFetcher->fetch('https://example.com/'), 'WEB_TIMEOUT','http_time_in_total_budget');

    $resolver = new ProcessDnsResolver(PHP_BINARY,__DIR__.'/fixtures/dns_fake.php');
    check($resolver->available() && $resolver->resolve('example.com',1000) === ['93.184.216.34','2606:4700::1111'], 'real_child_resolver_parses_bounded_output');
    reject(fn() => $resolver->resolve('invalid.example.com',1000), 'WEB_DNS_FAILED','child_invalid_output_rejected');
    $delayed = new ProcessDnsResolver(PHP_BINARY,__DIR__.'/fixtures/dns_delay.php'); $start = microtime(true);
    reject(fn() => $delayed->resolve('example.com',25), 'WEB_DNS_TIMEOUT','real_child_dns_wall_timeout');
    check((microtime(true)-$start) < 0.25,'dns_child_terminated_before_delayed_completion');
    check(!(new ProcessDnsResolver('/missing/php'))->available(),'missing_dns_runtime_unavailable');
    reject(fn() => (new CurlHttpTransport())->get('http://example.com/','127.0.0.1',1000,100), 'WEB_TARGET_NOT_PUBLIC','real_curl_adapter_revalidates_pin_before_connect');
    reject(fn() => (new CurlHttpTransport())->get('http://example.com/','93.184.216.34',0,100), 'WEB_TIMEOUT','real_curl_adapter_rejects_expired_budget');
    reject(fn() => (new CurlHttpTransport())->get('http://example.com/','93.184.216.34',1000,0), 'WEB_RESPONSE_TOO_LARGE','real_curl_adapter_rejects_zero_remaining_bytes');
    echo json_encode(['status'=>'passed','passed'=>count($checks),'checks'=>$checks,'synthetic_only'=>true,'external_network_requests'=>0,'llm_calls'=>0],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_PRETTY_PRINT).PHP_EOL;
} catch (\Throwable $error) {
    echo json_encode(['status'=>'failed','completed'=>count($checks),'failed_check'=>$error->getMessage(),'at'=>basename($error->getFile()).':'.$error->getLine()],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES).PHP_EOL; exit(1);
}
