<?php
declare(strict_types=1);
namespace humhub\modules\matcherWebapp\adapters\assets;

/** Reads one fixed Vite manifest and validates the complete reachable asset graph. */
final class Manifest
{
    private string $root;
    private array $nodes = [];
    private array $states = [];
    private array $files = [];

    public function __construct(string $directory)
    {
        $real = realpath($directory);
        if ($real === false || !is_dir($real) || is_link($directory)) {
            throw new \RuntimeException('Application release directory unavailable.');
        }
        $this->root = $real;
    }

    public function load(): array
    {
        $this->nodes = $this->states = $this->files = [];
        $manifest = $this->file('manifest.json', ['json']);
        $this->file('index.html', ['html']); // Never render build HTML or execute its script tags.
        if (filesize($manifest) > 1048576) { throw new \RuntimeException('Application manifest is too large.'); }
        try { $nodes = json_decode(file_get_contents($manifest), true, 64, JSON_THROW_ON_ERROR); }
        catch (\JsonException $e) { throw new \RuntimeException('Application manifest is invalid.', 0, $e); }
        if (!is_array($nodes) || count($nodes) > 2048 || !isset($nodes['index.html'])
            || !is_array($nodes['index.html']) || ($nodes['index.html']['isEntry'] ?? null) !== true) {
            throw new \RuntimeException('Application entry is missing.');
        }
        $this->nodes = $nodes;
        $this->visit('index.html', 0);
        $styles = [];
        $visited = [];
        $this->styles('index.html', $styles, $visited);
        return ['entry' => $nodes['index.html']['file'], 'css' => array_keys($styles), 'files' => array_keys($this->files)];
    }

    /** Publishing is confined to the already validated files and their parent folders. */
    public function publishFilter(array $files): \Closure
    {
        $allowed = array_fill_keys($files, true);
        $root = $this->root;
        return static function (string $from, string $to) use ($allowed, $root): bool {
            if (is_link($from)) { return false; }
            $real = realpath($from);
            if ($real === false || !str_starts_with($real, $root . DIRECTORY_SEPARATOR)) { return false; }
            $relative = str_replace(DIRECTORY_SEPARATOR, '/', substr($real, strlen($root) + 1));
            if (is_file($real)) { return isset($allowed[$relative]); }
            foreach ($allowed as $file => $_) { if (str_starts_with($file, $relative . '/')) { return true; } }
            return false;
        };
    }

    private function visit(string $key, int $depth): void
    {
        if ($depth > 64 || ($this->states[$key] ?? null) === 'visiting') { throw new \RuntimeException('Cyclic or excessive application asset graph.'); }
        if (($this->states[$key] ?? null) === 'done') { return; }
        $node = $this->nodes[$key] ?? null;
        if (!is_array($node)) { throw new \RuntimeException('Application import is missing.'); }
        $this->states[$key] = 'visiting';
        $this->add($node['file'] ?? null, ['js', 'mjs']);
        foreach ($this->list($node, 'css') as $file) { $this->add($file, ['css']); }
        foreach ($this->list($node, 'assets') as $file) {
            $this->add($file, ['avif', 'gif', 'ico', 'jpeg', 'jpg', 'png', 'svg', 'webp', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'mp4', 'webm']);
        }
        foreach (['imports', 'dynamicImports'] as $field) {
            foreach ($this->list($node, $field) as $import) {
                if (!is_string($import) || strlen($import) > 240
                    || preg_match('~^[A-Za-z0-9_-][A-Za-z0-9_./-]*$~D', $import) !== 1
                    || preg_match('~(?:^|/)(?:\.|\.\.)(?:/|$)~', $import) === 1
                    || str_contains($import, '//') || !isset($this->nodes[$import])) {
                    throw new \RuntimeException('Application import reference is invalid.');
                }
                $this->visit($import, $depth + 1);
            }
        }
        $this->states[$key] = 'done';
    }

    private function styles(string $key, array &$styles, array &$visited): void
    {
        if (isset($visited[$key])) { return; }
        $visited[$key] = true;
        foreach ($this->list($this->nodes[$key], 'imports') as $import) { $this->styles($import, $styles, $visited); }
        foreach ($this->list($this->nodes[$key], 'css') as $file) { $styles[$file] = true; }
    }

    private function list(array $node, string $field): array
    {
        $value = $node[$field] ?? [];
        if (!is_array($value) || !array_is_list($value) || count($value) > 2048) {
            throw new \RuntimeException('Application asset list is invalid.');
        }
        return $value;
    }

    private function add(mixed $file, array $extensions): void
    {
        $this->file($file, $extensions);
        $this->files[$file] = true;
    }

    private function file(mixed $relative, array $extensions): string
    {
        if (!is_string($relative) || strlen($relative) > 240
            || preg_match('~^[A-Za-z0-9_-][A-Za-z0-9_./-]*$~D', $relative) !== 1
            || !in_array(strtolower(pathinfo($relative, PATHINFO_EXTENSION)), $extensions, true)) {
            throw new \RuntimeException('Application asset path is invalid.');
        }
        $cursor = $this->root;
        foreach (explode('/', $relative) as $segment) {
            if ($segment === '' || $segment === '.' || $segment === '..' || str_starts_with($segment, '.')) {
                throw new \RuntimeException('Application asset traversal is forbidden.');
            }
            $cursor .= DIRECTORY_SEPARATOR . $segment;
            if (is_link($cursor)) { throw new \RuntimeException('Application asset symlinks are forbidden.'); }
        }
        $real = realpath($cursor);
        if ($real === false || !is_file($real) || !is_readable($real) || !str_starts_with($real, $this->root . DIRECTORY_SEPARATOR)) {
            throw new \RuntimeException('Application asset is missing or outside release.');
        }
        return $real;
    }
}
