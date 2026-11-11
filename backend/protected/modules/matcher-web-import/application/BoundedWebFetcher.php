<?php
declare(strict_types=1);
namespace humhub\modules\matcherWebImport\application;

use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherWebImport\domain\PublicAddressPolicy;
use humhub\modules\matcherWebImport\domain\WebLimits;
use humhub\modules\matcherWebImport\domain\WebUrl;
use humhub\modules\matcherWebImport\domain\ports\DnsResolver;
use humhub\modules\matcherWebImport\domain\ports\HttpTransport;

final class BoundedWebFetcher
{
    private \Closure $clock;
    public function __construct(private DnsResolver $dns, private HttpTransport $http, ?\Closure $clock = null)
    { $this->clock = $clock ?? static fn(): float => hrtime(true) / 1e6; }

    public function fetch(string $url): array
    {
        $url = WebUrl::normalize($url); $start = ($this->clock)(); $seen = []; $bytes = 0; $requests = 0;
        while (true) {
            if (isset($seen[$url])) { throw new ProfileException('WEB_REDIRECT_LOOP', 'The website redirects in a loop.', 502); }
            $seen[$url] = true; $remaining = $this->remaining($start);
            $addresses = $this->dns->resolve(parse_url($url, PHP_URL_HOST), min(WebLimits::DNS_MS, $remaining));
            $this->remaining($start);
            if ($addresses === [] || !array_is_list($addresses) || count($addresses) > 64) { throw new ProfileException('WEB_DNS_FAILED', 'The website hostname could not be resolved.', 502); }
            foreach ($addresses as $ip) { if (!is_string($ip)) { throw new ProfileException('WEB_DNS_FAILED', 'The website hostname could not be resolved.', 502); } PublicAddressPolicy::assertPublic($ip); }
            // Prefer IPv4 for local deployments; all returned IPv6 addresses were also verified.
            usort($addresses, static fn(string $a, string $b): int => strlen(inet_pton($a)) <=> strlen(inet_pton($b)));
            $response = $this->http->get($url, $addresses[0], min(WebLimits::REQUEST_MS, $this->remaining($start)), WebLimits::BODY_BYTES - $bytes);
            $this->remaining($start); $requests++;
            if (!is_int($response['status'] ?? null) || !is_array($response['headers'] ?? null) || !is_string($response['body'] ?? null)) { throw new ProfileException('WEB_INVALID_RESPONSE', 'The website returned an invalid response.', 502); }
            $bytes += strlen($response['body']);
            if ($bytes > WebLimits::BODY_BYTES) { throw new ProfileException('WEB_RESPONSE_TOO_LARGE', 'The website exceeds the supported download size.', 413); }
            $status = $response['status']; $headers = $response['headers'];
            if (in_array($status, [301,302,303,307,308], true)) {
                if ($requests > WebLimits::REDIRECTS) { throw new ProfileException('WEB_REDIRECT_LIMIT', 'The website redirects too many times.', 502); }
                if (!is_string($headers['location'] ?? null)) { throw new ProfileException('WEB_INVALID_RESPONSE', 'The website redirect has no valid target.', 502); }
                $next = WebUrl::resolve($url, $headers['location']);
                if (str_starts_with($url, 'https:') && !str_starts_with($next, 'https:')) { throw new ProfileException('WEB_INSECURE_REDIRECT', 'A secure website cannot redirect to an insecure target.', 502); }
                $url = $next; continue;
            }
            if (in_array($status, [401,403], true)) { throw new ProfileException('WEB_ACCESS_DENIED', 'The website requires access that this importer does not have.', 422); }
            if ($status === 404) { throw new ProfileException('WEB_NOT_FOUND', 'The requested website page was not found.', 422); }
            if ($status !== 200) { throw new ProfileException('WEB_HTTP_FAILED', 'The website could not provide a readable page.', 502); }
            $type = $headers['content-type'] ?? '';
            if (!is_string($type)) { throw new ProfileException('WEB_UNSUPPORTED_MEDIA', 'The website media type is unsupported.'); }
            if (isset($headers['content-encoding']) && strtolower(trim($headers['content-encoding'])) !== 'identity') { throw new ProfileException('WEB_UNSUPPORTED_ENCODING', 'The website sent an unsupported content encoding.'); }
            return ['body' => $response['body'], 'content_type' => $type, 'final_url' => $url,
                'network_requests' => $requests, 'redirects' => $requests - 1, 'downloaded_bytes' => $bytes,
                'elapsed_ms' => (int)(($this->clock)() - $start)];
        }
    }

    private function remaining(float $start): int
    {
        $remaining = WebLimits::TOTAL_MS - (int)ceil(($this->clock)() - $start);
        if ($remaining < 1) { throw new ProfileException('WEB_TIMEOUT', 'The website exceeded the reading time limit.', 504); }
        return $remaining;
    }
}
