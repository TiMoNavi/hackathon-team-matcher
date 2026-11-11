<?php
declare(strict_types=1);
namespace humhub\modules\matcherWebImport\adapters\parser;

use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherWebImport\domain\TextStructure;
use humhub\modules\matcherWebImport\domain\WebLimits;
use humhub\modules\matcherWebImport\domain\ports\WebDocumentParser;

final class NativeWebDocumentParser implements WebDocumentParser
{
    public function parse(string $body, string $contentType): array
    {
        if (strlen($body) > WebLimits::BODY_BYTES) { throw new ProfileException('WEB_RESPONSE_TOO_LARGE', 'The website exceeds the supported download size.', 413); }
        $media = strtolower(trim(explode(';', $contentType, 2)[0]));
        if (!in_array($media, ['text/html','application/xhtml+xml','text/plain'], true)) { throw new ProfileException('WEB_UNSUPPORTED_MEDIA', 'Only static HTML and plain text pages are supported.'); }
        [$text, $charset] = $this->decode($body, $contentType, $media !== 'text/plain');
        if ($media === 'text/plain') {
            return TextStructure::build($text, 'text') + ['metadata' => ['format' => 'text', 'charset' => $charset, 'parser' => 'native-plain-v1', 'scripts_executed' => false]];
        }
        if (substr_count($text, '<') > 20000 || preg_match('/<!ENTITY\b|<!DOCTYPE\b[^>]*\[/i', $text)) {
            throw new ProfileException('WEB_DOCUMENT_LIMIT', 'The website markup exceeds supported structural limits.');
        }
        if (!class_exists(\DOMDocument::class)) { throw new ProfileException('WEB_RUNTIME_UNAVAILABLE', 'The static HTML parser is unavailable.', 503); }
        $previous = libxml_use_internal_errors(true);
        try {
            $document = new \DOMDocument('1.0', 'UTF-8');
            $loaded = $document->loadHTML('<?xml encoding="UTF-8">' . $text, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING | LIBXML_COMPACT);
            if (!$loaded) { throw new ProfileException('WEB_INVALID_DOCUMENT', 'The website returned an unreadable HTML document.'); }
            $xpath = new \DOMXPath($document); $titleNode = $xpath->query('//title')->item(0);
            $title = $titleNode ? mb_substr(trim(preg_replace('/\s+/u', ' ', $titleNode->textContent)), 0, 160, 'UTF-8') : '';
            $remove = $xpath->query('//script|//style|//noscript|//template|//svg|//math|//iframe|//object|//embed|//canvas|//nav|//footer|//header|//aside|//form|//input|//select|//textarea|//button|//head|//comment()|//*[@hidden or @inert or translate(@aria-hidden,"TRUE","true")="true"]');
            foreach (iterator_to_array($remove) as $node) { if ($node->parentNode) { $node->parentNode->removeChild($node); } }
            foreach (iterator_to_array($xpath->query('//*[@style]')) as $node) {
                if (preg_match('/(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse))(?:\s*!important)?\s*(?:;|$)/i', $node->getAttribute('style'))) {
                    if ($node->parentNode) { $node->parentNode->removeChild($node); }
                }
            }
            // A semantic main/article reduces surrounding page chrome. Fall back to body.
            $root = $xpath->query('//main')->item(0) ?? $xpath->query('//article')->item(0) ?? $xpath->query('//body')->item(0) ?? $document;
            $plain = ''; $this->append($root, $plain, 0);
            $plain = str_replace("\xC2\xA0", ' ', $plain);
            $plain = preg_replace('/[ \t]+/u', ' ', $plain);
            $plain = preg_replace('/ *\n */u', "\n", $plain);
            $plain = preg_replace('/\n{3,}/', "\n\n", $plain);
            $plain = trim($plain);
            return TextStructure::build($plain, 'html') + ['metadata' => ['format' => 'html', 'charset' => $charset, 'title' => $title,
                'parser' => 'native-dom-v1', 'scripts_executed' => false, 'external_resources_loaded' => false, 'css_rendered' => false]];
        } finally { libxml_clear_errors(); libxml_use_internal_errors($previous); }
    }

    private function decode(string $body, string $contentType, bool $html): array
    {
        $charset = null;
        if (preg_match('/;\s*charset\s*=\s*["\x27]?([a-z0-9._-]+)/i', $contentType, $match)) { $charset = $match[1]; }
        if ($charset === null && $html && preg_match('/<meta\b[^>]*\bcharset\s*=\s*["\x27]?\s*([a-z0-9._-]+)/i', substr($body, 0, 4096), $match)) { $charset = $match[1]; }
        if (str_starts_with($body, "\xEF\xBB\xBF")) { $body = substr($body, 3); $charset = 'UTF-8'; }
        elseif (str_starts_with($body, "\xFF\xFE")) { $body = substr($body, 2); $charset = 'UTF-16LE'; }
        elseif (str_starts_with($body, "\xFE\xFF")) { $body = substr($body, 2); $charset = 'UTF-16BE'; }
        $aliases = ['utf-8'=>'UTF-8','utf8'=>'UTF-8','us-ascii'=>'ASCII','ascii'=>'ASCII','iso-8859-1'=>'ISO-8859-1','latin1'=>'ISO-8859-1','windows-1252'=>'Windows-1252','gb18030'=>'GB18030','gbk'=>'CP936','gb2312'=>'CP936','big5'=>'BIG-5','utf-16le'=>'UTF-16LE','utf-16be'=>'UTF-16BE'];
        $encoding = $aliases[strtolower($charset ?? 'utf-8')] ?? null;
        if ($encoding === null || !mb_check_encoding($body, $encoding)) { throw new ProfileException('WEB_CHARSET_UNSUPPORTED', 'The website character encoding is unsupported or invalid.'); }
        $text = $encoding === 'UTF-8' ? $body : mb_convert_encoding($body, 'UTF-8', $encoding);
        if (str_contains($text, chr(0))) { throw new ProfileException('WEB_INVALID_DOCUMENT', 'The website returned binary content.'); }
        return [$text, $encoding];
    }

    private function append(\DOMNode $node, string &$plain, int $depth): void
    {
        if ($depth > 128) { throw new ProfileException('WEB_DOCUMENT_DEPTH', 'The website document is too deeply nested.'); }
        if ($node instanceof \DOMText) {
            $plain .= preg_replace('/\s+/u', ' ', $node->nodeValue);
        } else {
            $tag = strtolower($node->nodeName);
            $block = in_array($tag, ['p','div','section','article','main','h1','h2','h3','h4','h5','h6','li','ul','ol','dl','dt','dd','tr','table','blockquote','pre','br','hr'], true);
            if ($block) { $plain .= "\n"; }
            if ($tag === 'pre') { $plain .= $node->textContent; }
            else { foreach ($node->childNodes as $child) { $this->append($child, $plain, $depth + 1); } }
            if (in_array($tag, ['td','th'], true)) { $plain .= ' '; }
            if ($block) { $plain .= "\n"; }
        }
        if (strlen($plain) > WebLimits::TEXT_BYTES) { throw new ProfileException('SOURCE_TEXT_TOO_LARGE', 'The source text exceeds the supported size.', 413); }
    }
}
