<?php
declare(strict_types=1);
namespace humhub\modules\matcherWebImport\domain;

use humhub\modules\matcherProfile\domain\ProfileException;

final class WebUrl
{
    public static function normalize(string $url): string
    {
        if ($url === '' || strlen($url) > WebLimits::URL_BYTES || preg_match('/[^\x21-\x7E]/', $url)
            || str_contains($url, chr(92)) || preg_match('/%(?:0[0-9a-f]|1[0-9a-f]|7f)/i', $url)
            || preg_match('/%(?![0-9a-f]{2})/i', $url)) { self::invalid(); }
        try { $parts = parse_url($url); } catch (\ValueError) { self::invalid(); }
        if (!is_array($parts) || isset($parts['user']) || isset($parts['pass']) || !isset($parts['scheme'], $parts['host'])) { self::invalid(); }
        $scheme = strtolower($parts['scheme']); $host = strtolower($parts['host']);
        if (!in_array($scheme, ['http', 'https'], true) || !preg_match('/^[a-z0-9.-]{1,253}$/D', $host)
            || str_ends_with($host, '.') || !str_contains($host, '.') || filter_var($host, FILTER_VALIDATE_IP)) { self::invalid(); }
        $labels = explode('.', $host);
        foreach ($labels as $label) {
            if (!preg_match('/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/D', $label)) { self::invalid(); }
        }
        if (!preg_match('/^[a-z][a-z0-9-]*$/D', end($labels))) { self::invalid(); }
        foreach (['localhost','local','internal','invalid','test','example','onion','home.arpa'] as $suffix) {
            if ($host === $suffix || str_ends_with($host, '.' . $suffix)) { self::invalid(); }
        }
        $defaultPort = $scheme === 'https' ? 443 : 80;
        if (isset($parts['port']) && $parts['port'] !== $defaultPort) { self::invalid(); }
        $path = $parts['path'] ?? '/'; if ($path === '') { $path = '/'; }
        if ($path[0] !== '/') { self::invalid(); }
        $path = self::removeDotSegments($path);
        $result = $scheme . '://' . $host . $path . (isset($parts['query']) ? '?' . $parts['query'] : '');
        if (strlen($result) > WebLimits::URL_BYTES) { self::invalid(); }
        return $result;
    }

    public static function resolve(string $base, string $location): string
    {
        $base = self::normalize($base);
        if ($location === '' || strlen($location) > WebLimits::URL_BYTES || preg_match('/[^\x21-\x7E]/', $location) || str_contains($location, chr(92))) { self::invalid(); }
        if (preg_match('/^[a-z][a-z0-9+.-]*:/i', $location)) { return self::normalize($location); }
        $parts = parse_url($base); $origin = $parts['scheme'] . '://' . $parts['host'];
        if (str_starts_with($location, '//')) { return self::normalize($parts['scheme'] . ':' . $location); }
        if ($location[0] === '#') { return $base; }
        if ($location[0] === '?') { return self::normalize($origin . $parts['path'] . $location); }
        if ($location[0] === '/') { return self::normalize($origin . $location); }
        return self::normalize($origin . substr($parts['path'], 0, strrpos($parts['path'], '/') + 1) . $location);
    }

    private static function removeDotSegments(string $path): string
    {
        $output = [];
        foreach (explode('/', $path) as $part) {
            // cURL also interprets literal dot segments; encoded segments remain an opaque path.
            if ($part === '.') { continue; }
            if ($part === '..') { if (count($output) > 1) { array_pop($output); } continue; }
            $output[] = $part;
        }
        $result = implode('/', $output);
        if ($result === '' || $result[0] !== '/') { $result = '/' . $result; }
        if ((str_ends_with($path, '/.') || str_ends_with($path, '/..')) && !str_ends_with($result, '/')) { $result .= '/'; }
        return $result;
    }

    private static function invalid(): never
    {
        throw new ProfileException('INVALID_WEB_URL', 'Provide an HTTP or HTTPS website URL with a public DNS hostname and its standard port.');
    }
}
