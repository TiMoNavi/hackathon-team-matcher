<?php
declare(strict_types=1);
/** Independent adversarial fixtures. All unsafe addresses use injected transports only. */
require dirname(__DIR__) . '/bootstrap.php';

use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherWebImport\domain\PublicAddressPolicy;
use humhub\modules\matcherWebImport\domain\WebUrl;
use humhub\modules\matcherWebImport\domain\WebLimits;
use humhub\modules\matcherWebImport\domain\ports\DnsResolver;
use humhub\modules\matcherWebImport\domain\ports\HttpTransport;
use humhub\modules\matcherWebImport\application\BoundedWebFetcher;
use humhub\modules\matcherWebImport\application\WebSourceReader;
use humhub\modules\matcherWebImport\application\TextSourceReader;
use humhub\modules\matcherWebImport\adapters\parser\NativeWebDocumentParser;
use humhub\modules\matcherWebImport\adapters\network\ProcessDnsResolver;

$checks = [];
function audit(string $label, bool $condition): void { global $checks; $checks[]=['name'=>$label,'passed'=>$condition]; }
function denied(string $label, callable $call, ?string $code=null): void {
    try { $call(); audit($label,false); }
    catch (ProfileException $e) { audit($label,$code===null || $code===$e->errorCode); }
    catch (Throwable $e) { audit($label,false); }
}
final class AuditDns implements DnsResolver {
    public array $calls=[];
    public function __construct(private Closure $resolveFn) {}
    public function resolve(string $host,int $timeoutMs):array { $this->calls[]=[$host,$timeoutMs];return ($this->resolveFn)($host,count($this->calls)); }
}
final class AuditHttp implements HttpTransport {
    public array $calls=[];
    public function __construct(private Closure $respond) {}
    public function get(string $url,string $ip,int $timeoutMs,int $maxBytes):array {
        $this->calls[]=['url'=>$url,'ip'=>$ip,'timeout_ms'=>$timeoutMs,'max_bytes'=>$maxBytes];
        return ($this->respond)($url,count($this->calls));
    }
}
function fixture(array $responses,?Closure $dns=null,?Closure $clock=null):array {
    $resolver=new AuditDns($dns??fn()=>['93.184.216.34']);
    $transport=new AuditHttp(fn($url,$number)=>$responses[min($number-1,count($responses)-1)]);
    return [new BoundedWebFetcher($resolver,$transport,$clock),$resolver,$transport];
}
function response(int $status=200,string $body='Name: Synthetic',array $headers=[]):array {
    return ['status'=>$status,'headers'=>$headers+['content-type'=>'text/plain; charset=utf-8'],'body'=>$body];
}

foreach(['0.0.0.0','0.1.2.3','10.255.255.255','100.64.0.1','100.127.255.254','127.0.0.1','127.1.2.3','169.254.169.254','172.16.0.1','172.31.255.254','192.0.0.8','192.0.2.1','192.88.99.1','192.168.1.2','198.18.0.1','198.19.255.254','198.51.100.2','203.0.113.2','224.0.0.1','239.255.255.255','240.0.0.1','255.255.255.255','::','::1','::ffff:127.0.0.1','::ffff:8.8.8.8','64:ff9b::7f00:1','100::1','2001:db8::1','2001::1','2002:7f00:1::1','3fff::1','fc00::1','fd12::1','fe80::1','fec0::1','ff02::1','not-an-ip'] as $index=>$ip) {
    denied('reject_nonpublic_ip_'.$index,fn()=>PublicAddressPolicy::assertPublic($ip),'WEB_TARGET_NOT_PUBLIC');
}
foreach(['1.1.1.1','8.8.8.8','93.184.216.34','2606:4700:4700::1111','2001:4860:4860::8888'] as $index=>$ip) {
    try { PublicAddressPolicy::assertPublic($ip);audit('allow_public_unicast_'.$index,true); } catch(Throwable) { audit('allow_public_unicast_'.$index,false); }
}
foreach(['http://127.0.0.1/','http://2130706433/','http://0177.0.0.1/','http://0x7f000001/','http://127.1/','http://[::1]/','https://user:pass@example.org/','file:///etc/passwd','ftp://example.org/','http://localhost/','http://host.internal/','http://example.org:8080/','https://example.org:80/','https://example.org./','https://example.org/%0d%0aX-Test:x','https://example.org/%00','https://example.org/%GG','https://example.org\@localhost/','//example.org/','https://example.org/ white','https://example.org/%1f'] as $index=>$url) {
    denied('reject_unsafe_url_'.$index,fn()=>WebUrl::normalize($url),'INVALID_WEB_URL');
}
audit('url_normalizes_case_default_port_fragment',WebUrl::normalize('HTTPS://EXAMPLE.ORG:443/a/../about#bio')==='https://example.org/about');
audit('relative_redirect_resolves_parent',WebUrl::resolve('https://example.org/a/b','../about?x=1')==='https://example.org/about?x=1');
audit('query_redirect_preserves_path',WebUrl::resolve('https://example.org/about?x=1','?x=2')==='https://example.org/about?x=2');

[$fetch,$dns,$http]=fixture([response()],fn()=>['93.184.216.34','127.0.0.1']);
denied('mixed_dns_answers_rejected',fn()=>$fetch->fetch('https://example.org/'),'WEB_TARGET_NOT_PUBLIC');
audit('mixed_dns_rejected_before_transport',$http->calls===[]);
[$fetch,$dns,$http]=fixture([response()],fn()=>['93.184.216.34','::ffff:127.0.0.1']);
denied('mixed_ipv6_answer_rejected',fn()=>$fetch->fetch('https://example.org/'),'WEB_TARGET_NOT_PUBLIC');
audit('mapped_ipv6_never_transported',$http->calls===[]);
[$fetch,$dns,$http]=fixture([response(302,'',['location'=>'https://cdn.example.org/about']),response()],fn($host)=>$host==='example.org'?['93.184.216.34']:['10.0.0.7']);
denied('redirect_private_dns_rejected',fn()=>$fetch->fetch('https://example.org/'),'WEB_TARGET_NOT_PUBLIC');
audit('unsafe_redirect_has_no_second_connection',count($http->calls)===1 && count($dns->calls)===2);
[$fetch,$dns,$http]=fixture([response(302,'',['location'=>'http://169.254.169.254/latest/meta-data/'])]);
denied('metadata_redirect_literal_rejected',fn()=>$fetch->fetch('https://example.org/'),'INVALID_WEB_URL');
audit('metadata_target_never_requested',count($http->calls)===1);
[$fetch,$dns,$http]=fixture([response(302,'',['location'=>'http://example.org/about'])]);
denied('https_downgrade_rejected',fn()=>$fetch->fetch('https://example.org/'),'WEB_INSECURE_REDIRECT');
[$fetch,$dns,$http]=fixture([response(302,'',['location'=>'/again']),response()],fn($host,$n)=>$n===1?['93.184.216.34']:['127.0.0.1']);
denied('same_host_dns_rebinding_rejected_each_hop',fn()=>$fetch->fetch('https://example.org/'),'WEB_TARGET_NOT_PUBLIC');
audit('dns_rebinding_no_second_connection',count($http->calls)===1);
[$fetch,$dns,$http]=fixture([response(302,'',['location'=>'/a']),response(302,'',['location'=>'/b']),response(302,'',['location'=>'/c']),response(302,'',['location'=>'/d'])]);
denied('redirect_limit_is_bounded',fn()=>$fetch->fetch('https://example.org/'),'WEB_REDIRECT_LIMIT');
audit('redirect_limit_max_four_requests',count($http->calls)===4);
[$fetch,$dns,$http]=fixture([response(302,'',['location'=>'#loop'])]);
denied('fragment_redirect_loop_rejected',fn()=>$fetch->fetch('https://example.org/'),'WEB_REDIRECT_LOOP');
[$fetch,$dns,$http]=fixture([response(302,'12345',['location'=>'/about']),response(200,'Name: Audit')]);
$download=$fetch->fetch('https://example.org/');
audit('actual_transport_receives_approved_ip',array_column($http->calls,'ip')===['93.184.216.34','93.184.216.34']);
audit('redirect_byte_budget_decreases',$http->calls[1]['max_bytes']===$http->calls[0]['max_bytes']-5);
audit('final_url_and_request_count_recorded',$download['final_url']==='https://example.org/about' && $download['network_requests']===2);
[$fetch,$dns,$http]=fixture([response(200,str_repeat('a',WebLimits::BODY_BYTES+1))]);
denied('aggregate_download_limit_enforced',fn()=>$fetch->fetch('https://example.org/'),'WEB_RESPONSE_TOO_LARGE');
$ticks=0;
[$fetch,$dns,$http]=fixture([response()],null,function()use(&$ticks){$ticks+=6000;return (float)$ticks;});
denied('overall_clock_budget_enforced',fn()=>$fetch->fetch('https://example.org/'),'WEB_TIMEOUT');
foreach([401,403] as $status){[$fetch]=fixture([response($status)]);denied('http_login_wall_'.$status,fn()=>$fetch->fetch('https://example.org/'),'WEB_ACCESS_DENIED');}
[$fetch]=fixture([response(200,'compressed',['content-encoding'=>'gzip'])]);
denied('unsolicited_compression_rejected',fn()=>$fetch->fetch('https://example.org/'),'WEB_UNSUPPORTED_ENCODING');

$parser=new NativeWebDocumentParser();
$html='<!doctype html><html><head><title>Synthetic Profile</title><style>.x{color:red}</style><script>HEAD_SCRIPT_SECRET</script></head><body><nav>NAV_SECRET</nav><main><h1>Name: Audit Person</h1><p>City: Hangzhou</p><p>Skills: PHP, Python</p><script>SCRIPT_SECRET</script><style>STYLE_SECRET</style><template>TEMPLATE_SECRET</template><noscript>NOSCRIPT_SECRET</noscript><iframe>IFRAME_SECRET</iframe><div hidden>HIDDEN_SECRET</div><div aria-hidden="true">ARIA_SECRET</div><div style="display:none">DISPLAY_SECRET</div><div style="visibility: hidden !important">VISIBILITY_SECRET</div><form>FORM_SECRET</form><!-- COMMENT_SECRET --><p>Public &amp; useful</p></main><footer>FOOTER_SECRET</footer></body></html>';
$parsed=$parser->parse($html,'text/html; charset=UTF-8');
audit('semantic_main_preserves_public_text',str_contains($parsed['raw_text'],'Name: Audit Person') && str_contains($parsed['raw_text'],'Public & useful'));
audit('hidden_script_template_and_chrome_excluded',!str_contains($parsed['raw_text'],'SECRET'));
audit('parser_does_not_keep_raw_html',!str_contains($parsed['raw_text'],'<script') && $parsed['metadata']['scripts_executed']===false && $parsed['metadata']['external_resources_loaded']===false);
audit('html_title_retained_separately',$parsed['metadata']['title']==='Synthetic Profile');
denied('external_entity_document_rejected_before_expansion',fn()=>$parser->parse('<!DOCTYPE html [<!ENTITY test SYSTEM "data:text/plain,EXTERNAL_ENTITY_SECRET">]><html><body><p>Name: Audit</p><p>&test;</p></body></html>','text/html'),'WEB_DOCUMENT_LIMIT');
denied('unsupported_binary_media',fn()=>$parser->parse('%PDF-1.0','application/pdf'),'WEB_UNSUPPORTED_MEDIA');
denied('script_only_page_has_no_source',fn()=>$parser->parse('<html><body><script>private</script></body></html>','text/html'),'SOURCE_NO_TEXT');
denied('markup_token_density_bounded_before_dom',fn()=>$parser->parse(str_repeat('<i></i>',10001),'text/html'),'WEB_DOCUMENT_LIMIT');
$loginPrompt=$parser->parse('<html><head><title>Sign in</title></head><body><main><p>Sign in to view this profile</p><form><input type="password"></form></main></body></html>','text/html');
audit('http200_login_prompt_is_plain_source_not_semantically_classified',$loginPrompt['raw_text']==='Sign in to view this profile');
denied('binary_mislabeled_plain_text_rejected',fn()=>$parser->parse("hello\0world",'text/plain'),'WEB_INVALID_DOCUMENT');
denied('unsupported_charset_rejected',fn()=>$parser->parse('Name: Audit','text/plain; charset=made-up-charset'),'WEB_CHARSET_UNSUPPORTED');
$cn=$parser->parse(mb_convert_encoding('姓名：独立测试','GB18030','UTF-8'),'text/plain; charset=gb18030');
audit('declared_chinese_charset_decoded',$cn['raw_text']==='姓名：独立测试');

$reader=new TextSourceReader();
$pasted="\xEF\xBB\xBF姓名：独立审查\r\n技能：Python、PHP\r\n";
$text=$reader->read(1,['text'=>$pasted,'ownership'=>'self']);
audit('text_bom_crlf_normalized',$text['raw_text']==="姓名：独立审查\n技能：Python、PHP\n");
audit('self_declaration_not_verified_ownership',$text['metadata']['ownership_basis']==='self_declared' && !isset($text['metadata']['ownership_verified']));
audit('plain_source_has_no_network_or_model',$text['metadata']['network_requests']===0 && $text['metadata']['llm_calls']===0);
$normal=$reader->identify(1,['text'=>$text['raw_text'],'ownership'=>'self']);
audit('normalization_preserves_source_identity',$normal['external_id']===$text['external_id']);
denied('text_without_ownership_rejected',fn()=>$reader->read(1,['text'=>'Name: Audit']),'SOURCE_OWNERSHIP_REQUIRED');
denied('text_oversize_rejected',fn()=>$reader->read(1,['text'=>str_repeat('x',WebLimits::PASTE_BYTES+1),'ownership'=>'self']),'SOURCE_TEXT_TOO_LARGE');
denied('text_null_byte_rejected',fn()=>$reader->read(1,['text'=>"a\0b",'ownership'=>'self']),'SOURCE_TEXT_INVALID');
$long=$reader->read(1,['text'=>str_repeat('中文',20000),'ownership'=>'self']);
audit('long_unicode_line_split_without_loss',implode('',array_column($long['sections'],'text'))===$long['raw_text'] && max(array_map('strlen',array_column($long['sections'],'text')))<=WebLimits::SECTION_BYTES);

[$fetch,$dns,$http]=fixture([response(302,'',['location'=>'/about']),response(200,'Name: Audit Person')]);
$web=new WebSourceReader($fetch,$parser,null,fn()=>true);
$identity=$web->identify(1,['url'=>'https://example.org/start#bio','ownership'=>'self']);
$status=$web->status(1);
audit('identity_and_status_do_not_use_network',$dns->calls===[] && $http->calls===[]);
$webData=$web->read(1,['url'=>'https://example.org/start#bio','ownership'=>'self']);
audit('redirect_does_not_change_source_canonical_url',$webData['canonical_url']==='https://example.org/start' && $webData['metadata']['final_url']==='https://example.org/about');
audit('web_identity_stable_after_redirect',$webData['external_id']===$identity['external_id']);
audit('web_candidates_have_local_evidence',count($webData['candidates'])>0 && array_diff($webData['candidates'][0]['evidence'],array_column($webData['sections'],'id'))===[]);

$sleepScript=tempnam(sys_get_temp_dir(),'matcher-s5b-audit-');
file_put_contents($sleepScript,'<?php usleep(2000000); echo "[\"93.184.216.34\"]";');
try {
    $start=microtime(true);
    denied('real_dns_process_wall_timeout',fn()=>(new ProcessDnsResolver(PHP_BINARY,$sleepScript))->resolve('example.org',30),'WEB_DNS_TIMEOUT');
    audit('dns_timeout_returns_before_sleep_finishes',microtime(true)-$start<1.0);
} finally { unlink($sleepScript); }

$failed=array_values(array_filter($checks,fn($c)=>!$c['passed']));
echo json_encode(['status'=>$failed===[]?'passed':'failed','passed'=>count($checks)-count($failed),'failed'=>count($failed),'checks'=>$checks,'network_requests'=>0,'unsafe_targets'=>'injected DNS/HTTP only','real_adapter_execution'=>'DOM parser and bounded DNS child process timeout','llm_calls'=>0],JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),PHP_EOL;
exit($failed===[]?0:1);
