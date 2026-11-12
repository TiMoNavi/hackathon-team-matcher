<?php
declare(strict_types=1);
namespace humhub\modules\matcherChatUi\adapters\assets;

/** Validates one fixed release and publishes only the reachable static asset graph. */
final class Manifest
{
    private const MEDIA = ['avif', 'gif', 'ico', 'jpeg', 'jpg', 'png', 'svg', 'webp', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'mp4', 'webm'];
    private string $root;
    private array $nodes = [];
    private array $states = [];
    private array $files = [];

    public function __construct(string $directory)
    {
        $real = realpath($directory);
        if ($real === false || !is_dir($real) || $real !== rtrim($directory, DIRECTORY_SEPARATOR)) {
            throw new \RuntimeException('Chat release must be a canonical local directory.');
        }
        $this->root = $real;
    }

    public function load(): array
    {
        $this->nodes = $this->states = $this->files = [];
        $file = $this->file('manifest.json', ['json']);
        $this->file('index.html', ['html']);
        clearstatcache(true, $file);
        if (filesize($file) > 1048576) { throw new \RuntimeException('Chat manifest exceeds its size limit.'); }
        try { $nodes = json_decode(file_get_contents($file), true, 64, JSON_THROW_ON_ERROR); }
        catch (\JsonException $e) { throw new \RuntimeException('Chat manifest is invalid.', 0, $e); }
        if (!is_array($nodes) || count($nodes) > 2048 || !isset($nodes['index.html'])
            || !is_array($nodes['index.html']) || ($nodes['index.html']['isEntry'] ?? null) !== true) {
            throw new \RuntimeException('Chat manifest entry is missing.');
        }
        $this->nodes = $nodes;
        $this->visit('index.html', 0);
        $styles = $visited = [];
        $this->collectStyles('index.html', $styles, $visited);
        return ['entry' => $nodes['index.html']['file'], 'css' => array_keys($styles), 'files' => array_keys($this->files)];
    }

    public function publishFilter(array $files): \Closure
    {
        $allowed = array_fill_keys($files, true);
        $root = $this->root;
        return static function (string $from, string $to) use ($allowed, $root): bool {
            $real = realpath($from);
            if ($real === false || $real !== rtrim($from, DIRECTORY_SEPARATOR)
                || !str_starts_with($real, $root . DIRECTORY_SEPARATOR)) { return false; }
            $relative = str_replace(DIRECTORY_SEPARATOR, '/', substr($real, strlen($root) + 1));
            if (is_file($real)) { return isset($allowed[$relative]); }
            if (!is_dir($real)) { return false; }
            foreach ($allowed as $file => $_) {
                if (str_starts_with($file, $relative . '/')) { return true; }
            }
            return false;
        };
    }

    private function visit(string $key, int $depth): void
    {
        if ($depth > 64 || ($this->states[$key] ?? null) === 'visiting') {
            throw new \RuntimeException('Chat asset graph is cyclic or too deep.');
        }
        if (($this->states[$key] ?? null) === 'done') { return; }
        $node = $this->nodes[$key] ?? null;
        if (!is_array($node)) { throw new \RuntimeException('Chat asset import is missing.'); }
        $this->states[$key] = 'visiting';
        $this->add($node['file'] ?? null, ['js', 'mjs']);
        foreach ($this->list($node, 'css') as $file) { $this->add($file, ['css']); }
        foreach ($this->list($node, 'assets') as $file) { $this->add($file, self::MEDIA); }
        foreach (['imports', 'dynamicImports'] as $kind) {
            foreach ($this->list($node, $kind) as $import) {
                if (!self::safeRelative($import) || !isset($this->nodes[$import])) {
                    throw new \RuntimeException('Chat import reference is invalid.');
                }
                $this->visit($import, $depth + 1);
            }
        }
        $this->states[$key] = 'done';
    }

    private function collectStyles(string $key, array &$styles, array &$visited): void
    {
        if (isset($visited[$key])) { return; }
        $visited[$key] = true;
        foreach ($this->list($this->nodes[$key], 'imports') as $import) { $this->collectStyles($import, $styles, $visited); }
        foreach ($this->list($this->nodes[$key], 'css') as $file) { $styles[$file] = true; }
    }

    private function list(array $node, string $key): array
    {
        $value = $node[$key] ?? [];
        if (!is_array($value) || !array_is_list($value) || count($value) > 2048) {
            throw new \RuntimeException('Chat manifest list is invalid.');
        }
        return $value;
    }

    private function add(mixed $relative, array $extensions): void
    {
        $this->file($relative, $extensions);
        $this->files[$relative] = true;
    }

    private static function safeRelative(mixed $relative): bool
    {
        if (!is_string($relative) || strlen($relative) > 240
            || preg_match('~^[A-Za-z0-9_-][A-Za-z0-9_./-]*$~D', $relative) !== 1) { return false; }
        foreach (explode('/', $relative) as $segment) {
            if ($segment === '' || str_starts_with($segment, '.')) { return false; }
        }
        return true;
    }

    private function file(mixed $relative, array $extensions): string
    {
        if (!self::safeRelative($relative) || !in_array(strtolower(pathinfo($relative, PATHINFO_EXTENSION)), $extensions, true)) {
            throw new \RuntimeException('Chat asset path is invalid.');
        }
        $candidate = $this->root;
        foreach (explode('/', $relative) as $segment) {
            $candidate .= DIRECTORY_SEPARATOR . $segment;
            if (is_link($candidate)) { throw new \RuntimeException('Chat asset symlinks are forbidden.'); }
        }
        $real = realpath($candidate);
        if ($real === false || !is_file($real) || !is_readable($real) || !str_starts_with($real, $this->root . DIRECTORY_SEPARATOR)) {
            throw new \RuntimeException('Chat asset is missing or outside its release.');
        }
        return $real;
    }
}
