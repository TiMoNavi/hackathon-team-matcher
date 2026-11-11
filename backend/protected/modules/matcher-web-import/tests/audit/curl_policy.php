<?php
declare(strict_types=1);
/** Run the real cURL adapter against namespaced cURL function shims; zero sockets. */
namespace humhub\modules\matcherWebImport\adapters\network {
    function curl_init() { return new \stdClass(); }
    function curl_setopt_array($handle,array $options):bool { $GLOBALS['audit_curl']['options']=$options;return true; }
    function curl_exec($handle):bool {
        $state=&$GLOBALS['audit_curl'];$options=$state['options'];
        foreach($state['headers'] as $line) {
            if($options[CURLOPT_HEADERFUNCTION]($handle,$line)!==strlen($line))return false;
        }
        foreach($state['chunks'] as $chunk) {
            if($options[CURLOPT_WRITEFUNCTION]($handle,$chunk)!==strlen($chunk))return false;
        }
        return $state['success'];
    }
    function curl_errno($handle):int { return $GLOBALS['audit_curl']['errno']; }
    function curl_getinfo($handle,int $option):mixed { return $option===CURLINFO_PRIMARY_IP?$GLOBALS['audit_curl']['connected']:200; }
    function curl_close($handle):void { throw new \ErrorException('Deprecated cURL close must not be used', 0, E_DEPRECATED); }
}
namespace {
    require dirname(__DIR__).'/bootstrap.php';
    use humhub\modules\matcherProfile\domain\ProfileException;
    use humhub\modules\matcherWebImport\adapters\network\CurlHttpTransport;
    $checks=[];
    function verify(string $name,bool $ok):void { global $checks;$checks[]=['name'=>$name,'passed'=>$ok]; }
    function setup(array $extra=[]):void {
        $GLOBALS['audit_curl']=$extra+['headers'=>["HTTP/1.1 200 OK\r\n","Content-Type: text/plain\r\n","\r\n"],'chunks'=>['Name: Synthetic'],'success'=>true,'errno'=>0,'connected'=>'93.184.216.34','options'=>[]];
    }
    function failure(string $name,string $expected,array $state,int $maxBytes=100):void {
        setup($state);
        try { (new CurlHttpTransport())->get('https://example.org/about','93.184.216.34',1250,$maxBytes);verify($name,false); }
        catch(ProfileException $e) { verify($name,$e->errorCode===$expected); }
    }
    setup();$result=(new CurlHttpTransport())->get('https://example.org/about','93.184.216.34',1250,100);
    $o=$GLOBALS['audit_curl']['options'];
    verify('real_adapter_get_returns_bounded_body',$result['body']==='Name: Synthetic' && $result['headers']['content-type']==='text/plain');
    verify('approved_address_is_dns_pinned',$o[CURLOPT_RESOLVE]===['example.org:443:93.184.216.34']);
    verify('url_hostname_preserves_tls_sni',$o[CURLOPT_URL]==='https://example.org/about');
    verify('automatic_redirects_disabled',$o[CURLOPT_FOLLOWLOCATION]===false && $o[CURLOPT_MAXREDIRS]===0);
    verify('only_http_https_protocols',$o[CURLOPT_PROTOCOLS]===(CURLPROTO_HTTP|CURLPROTO_HTTPS) && $o[CURLOPT_REDIR_PROTOCOLS]===(CURLPROTO_HTTP|CURLPROTO_HTTPS));
    verify('environment_proxy_and_netrc_disabled',$o[CURLOPT_PROXY]==='' && $o[CURLOPT_NOPROXY]==='*' && $o[CURLOPT_NETRC]===CURL_NETRC_IGNORED);
    verify('tls_peer_and_host_validated',$o[CURLOPT_SSL_VERIFYPEER]===true && $o[CURLOPT_SSL_VERIFYHOST]===2);
    verify('approved_connection_not_reused',$o[CURLOPT_FRESH_CONNECT]===true && $o[CURLOPT_FORBID_REUSE]===true && $o[CURLOPT_DNS_CACHE_TIMEOUT]===0);
    verify('timeout_propagated_to_connection',$o[CURLOPT_TIMEOUT_MS]===1250 && $o[CURLOPT_CONNECTTIMEOUT_MS]===1250);
    verify('request_is_get_without_credentials',$o[CURLOPT_HTTPGET]===true && array_intersect_key($o,array_flip([CURLOPT_USERPWD,CURLOPT_COOKIE,CURLOPT_COOKIEFILE,CURLOPT_COOKIEJAR,CURLOPT_POSTFIELDS]))===[]);
    verify('headers_are_fixed_and_no_authorization',count($o[CURLOPT_HTTPHEADER])===3 && !preg_grep('/authorization|cookie/i',$o[CURLOPT_HTTPHEADER]));
    verify('compression_not_requested',in_array('Accept-Encoding: identity',$o[CURLOPT_HTTPHEADER],true));
    failure('wrong_actual_address_rejected','WEB_ADDRESS_MISMATCH',['connected'=>'127.0.0.1']);
    failure('response_size_callback_aborts','WEB_RESPONSE_TOO_LARGE',['chunks'=>['abc','def']],5);
    failure('duplicate_content_type_rejected','WEB_INVALID_RESPONSE',['headers'=>["HTTP/1.1 200 OK\r\n","Content-Type: text/plain\r\n","Content-Type: text/html\r\n"]]);
    failure('duplicate_location_rejected','WEB_INVALID_RESPONSE',['headers'=>["HTTP/1.1 302 Found\r\n","Location: /a\r\n","Location: /b\r\n"]]);
    failure('header_control_character_rejected','WEB_INVALID_RESPONSE',['headers'=>["HTTP/1.1 200 OK\r\n","Location: /a\x01b\r\n"]]);
    failure('malformed_header_rejected','WEB_INVALID_RESPONSE',['headers'=>["HTTP/1.1 200 OK\r\n","not-a-header\r\n"]]);
    failure('header_limit_enforced','WEB_HEADER_LIMIT',['headers'=>["HTTP/1.1 200 OK\r\n",'X-Fill: '.str_repeat('a',33000)."\r\n"]]);
    failure('curl_timeout_sanitized','WEB_TIMEOUT',['success'=>false,'errno'=>CURLE_OPERATION_TIMEDOUT]);
    failure('curl_network_error_sanitized','WEB_NETWORK_FAILED',['success'=>false,'errno'=>CURLE_COULDNT_CONNECT]);
    setup(['connected'=>'2606:4700:4700::1111']);
    (new CurlHttpTransport())->get('https://example.org/','2606:4700:4700::1111',1000,100);
    verify('ipv6_pin_has_required_brackets',$GLOBALS['audit_curl']['options'][CURLOPT_RESOLVE]===['example.org:443:[2606:4700:4700::1111]']);
    $failed=array_values(array_filter($checks,fn($c)=>!$c['passed']));
    echo json_encode(['status'=>$failed===[]?'passed':'failed','passed'=>count($checks)-count($failed),'failed'=>count($failed),'checks'=>$checks,'network_requests'=>0,'scope'=>'real CurlHttpTransport with namespaced cURL function shims; options and callbacks, not an actual socket'],JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES),PHP_EOL;
    exit($failed===[]?0:1);
}
