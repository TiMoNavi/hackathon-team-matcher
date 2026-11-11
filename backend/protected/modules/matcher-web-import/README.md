# Personal website and pasted-text sources

P5 version 0.1.0 is a backend-only HumHub module. It provides two readers to `matcher-user-profile`: `web` for one public page explicitly submitted by its owner, and `text` for pasted text. It adds no page, frontend asset, model client or database table.

The product contract is [S5-B website and text sources](../../../../docs/用户画像收集/19_S5B网站与文字来源约定.md). P1 owns source versions, snapshots, jobs, deletion, authorization and explicit candidate adoption.

## Requirements and installation

- HumHub 1.19.4 or newer and enabled `matcher-user-profile` 0.6.0 or newer.
- PHP cURL, DOM and mbstring. Website imports also require `proc_open` and a PHP CLI executable for bounded DNS resolution. Text imports require only mbstring and make no network requests.
- No new Composer, Python, browser or model dependency. Enable P5 after upgrading P1; P1 discovers both readers through `Module::getSourceReader($kind)`. GitHub, resume and onboarding do not depend on P5.
- CLI and the PHP built-in server use the current PHP executable for the DNS child. PHP-FPM defaults to `PHP_BINDIR/php`. A deployment can set the module's server-only `dnsPhpBinary` property to a PHP CLI path; this is never accepted from source input. A missing runtime reports unavailable or a failed read, without blocking ordinary profile editing.

## Input and ownership

The P1 source API accepts these source-specific fields, in addition to its existing request/version/idempotency envelope:

- Website: `kind=web`, `url`, `ownership=self`.
- Text: `kind=text`, `text`, optional `label`, `ownership=self`.

The readers reject unexpected fields and require a positive owner ID. `ownership_basis=self_declared` records the user's explicit statement; it does not verify domain control, authorship or truthfulness.

Website identity is `web:` plus SHA-256 of the normalized input URL. Scheme/hostname are lowercased, default port and fragment removed, root path supplied and literal dot segments resolved. The original normalized address remains `canonical_url` after redirects; the final response address is private metadata. P1 reconstructs the original target on refresh.

Text identity is `text:` plus SHA-256 of normalized UTF-8 content. UTF-8 BOM is removed and CRLF/CR becomes LF; other content is preserved. Labels do not change identity. Different text is a new source; refreshing an existing text source requires the same normalized text. Its `canonical_url` is null.

## Network limits

| Boundary | Limit or behavior |
|---|---|
| URL | 2,048 bytes; HTTP port 80 or HTTPS port 443 |
| Hostname | ASCII DNS or already encoded punycode; no credentials, IP literals, numeric variants or local/reserved hostname suffixes |
| DNS | All returned A/AAAA answers must pass the public-address policy; at most 64 addresses and 8 CNAME names |
| DNS wall time | Up to 3,000 ms per hop within the remaining total budget; parent terminates timed-out child |
| Read wall time | 15,000 ms for DNS and HTTP; each request at most 10,000 ms; connect at most 3,000 ms |
| Redirects | At most 3 redirects / 4 requests; normalize, resolve and check each target again |
| Connection | Approved IP pinned through `CURLOPT_RESOLVE`; actual connected IP checked |
| Addresses | Reject private, loopback, link-local, CGNAT, multicast and reserved/documentation ranges; reject IPv4-mapped IPv6, NAT64 and 6to4 |
| Transport | No proxy, automatic redirects, cookies, OAuth tokens or credential forwarding; TLS peer/hostname checks enabled |
| Download | At most 1 MiB across all response bodies, including redirects; at most 32 KiB headers per request |
| Encoding | Requests identity encoding; rejects compressed responses |
| Downgrade | HTTPS cannot redirect to HTTP |

A mixed public/private DNS answer fails before connecting. IPv6 uses a conservative global-unicast policy; uncommon but legitimate special addresses, nonstandard ports or unsupported hostnames may require pasting text instead.

`ProcessDnsResolver` runs blocking system DNS in a short-lived PHP CLI process. The parent enforces its deadline rather than assuming `dns_get_record` supports a timeout. The child receives only the validated hostname and a minimal environment. Errors and job receipts exclude connection diagnostics and whole submitted URLs.

## Parsing and candidates

Supported media are `text/html`, `application/xhtml+xml` and `text/plain`. Static DOM parsing uses `LIBXML_NONET` and does not fetch resources, execute JavaScript, calculate external CSS, perform OCR or operate a browser.

Extraction removes scripts, styles, templates, embedded objects, forms, navigation and other surrounding markup. It also removes `hidden`, `inert`, `aria-hidden=true` and recognized inline `display:none` or `visibility:hidden/collapse` elements. It prefers a semantic main/article, then body. Class-based or external-CSS visibility cannot be inferred. The HTML title supplies a label when present.

Supported explicit character encodings include UTF-8, ASCII, ISO-8859-1, Windows-1252, GB18030/GBK/GB2312, Big5 and BOM/explicit UTF-16LE/BE. Without a declaration the parser expects UTF-8. Invalid/unsupported encodings are rejected rather than guessed.

| Structured input | Limit |
|---|---|
| Pasted UTF-8 | 128 KiB; P1 also limits the enclosing JSON request to 256 KiB |
| Extracted web text | 256 KiB |
| HTML structure | At most 20,000 markup opening characters before DOM parsing; rejects ENTITY declarations/internal DOCTYPE subsets |
| Traversal depth | 128 nested nodes |
| Sections | At most 2,000 line-addressed sections, each at most 16 KiB; Unicode-safe long-line splitting |
| Candidate mapping | P1 `ExplicitTextCandidateMapper` uses explicit labels only; maximum 200 candidates |
| Complete saved structure | P1 validates its 2 MiB snapshot limit |

The result contains extracted text, located sections, candidate evidence and metadata. Downloaded HTML is not retained. Unlabelled prose stays private source material and does not become invented facts. The shared mapper preserves existing resume candidate IDs and field codes.

HTTP 401/403 returns access denied. JavaScript-only or empty pages return no-text. A website returning HTTP 200 for a login notice, CAPTCHA or interstitial may produce that notice as unconfirmed text; the importer does not guess login walls from keywords. Successful download does not confirm or publish its content.

Sources and snapshots stay private in P1. Candidates require owner selection and ordinary profile confirmation. No scheduled re-fetch, automatic expiry or publication is added. Both readers use rules and make **zero model calls**.

## Verification and test composition

From the project root with the local PHP runtime:

```sh
backend/.runtime/php-mysql/bin/php -c backend/.runtime/php.ini backend/protected/modules/matcher-web-import/tests/run.php
backend/.runtime/php-mysql/bin/php -c backend/.runtime/php.ini backend/protected/modules/matcher-web-import/tests/public_smoke.php
```

The first is a synthetic-only suite with no external network. It checks URL/address policy, redirect revalidation, actual bounded DNS child processes, parsing, ownership, identity and evidence. The second independently tests real DNS/cURL/DOM against the fixed public example page, writes no profile, and reports only metrics and a hash.

`tests/bootstrap.php` loads P1/P5 without a HumHub database. DNS, HTTP and document-parser ports are injectable. `Module::setSourceReader($kind, $reader)` is only a server-side integration-test seam, with no HTTP setting or client switch. API/SQL ownership, version, idempotency and adoption are covered by P1 integration tests.
