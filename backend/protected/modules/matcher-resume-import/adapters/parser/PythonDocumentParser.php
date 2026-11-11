<?php
declare(strict_types=1);
namespace humhub\modules\matcherResumeImport\adapters\parser;

use humhub\modules\matcherProfile\domain\ProfileException;
use humhub\modules\matcherResumeImport\domain\ports\DocumentParser;

/** Local, bounded parser process. No shell interpolation, document execution or network client. */
final class PythonDocumentParser implements DocumentParser
{
    public function __construct(private string $pythonBinary, private string $worker, private float $timeoutSeconds = 15.0) {}

    public function available(): bool
    {
        if (!is_executable($this->pythonBinary) || !is_file($this->worker)) { return false; }
        try { return ($this->invoke(['action' => 'capabilities'])['available'] ?? false) === true; }
        catch (ProfileException) { return false; }
    }

    public function parse(string $path, string $format): array
    {
        return $this->invoke(['action' => 'parse', 'path' => $path, 'format' => $format]);
    }

    private function invoke(array $payload): array
    {
        if (!is_executable($this->pythonBinary) || !is_file($this->worker)) { throw new ProfileException('RESUME_PARSER_UNAVAILABLE', 'The local resume parser is not installed.', 503); }
        $pipes = [];
        $process = @proc_open([$this->pythonBinary, '-I', $this->worker], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, ['PATH' => '/usr/bin:/bin', 'PYTHONDONTWRITEBYTECODE' => '1'], ['bypass_shell' => true]);
        if (!is_resource($process)) { throw new ProfileException('RESUME_PARSER_UNAVAILABLE', 'The local resume parser could not be started.', 503); }
        $output = ''; $diagnosticBytes = 0; $start = microtime(true);
        try {
            fwrite($pipes[0], json_encode($payload, JSON_THROW_ON_ERROR)); fclose($pipes[0]);
            stream_set_blocking($pipes[1], false); stream_set_blocking($pipes[2], false);
            while (true) {
                $output .= stream_get_contents($pipes[1]); $diagnosticBytes += strlen(stream_get_contents($pipes[2]));
                if (strlen($output) > 3 * 1024 * 1024 || $diagnosticBytes > 65536) { throw new ProfileException('RESUME_LIMIT_EXCEEDED', 'This document exceeds the parser output limit.', 413); }
                $state = proc_get_status($process);
                if (!$state['running']) { break; }
                if (microtime(true) - $start > $this->timeoutSeconds) { throw new ProfileException('RESUME_PARSE_TIMEOUT', 'This document took too long to parse. Try a smaller text document.', 503); }
                usleep(10000);
            }
            $output .= stream_get_contents($pipes[1]);
            try { $result = json_decode($output, true, 64, JSON_THROW_ON_ERROR); }
            catch (\JsonException) { throw new ProfileException('RESUME_INVALID_DOCUMENT', 'This document could not be parsed safely. Try a text-based PDF, DOCX, Markdown or UTF-8 text file.'); }
            if (($result['status'] ?? null) !== 'ok') {
                $code = $result['error']['code'] ?? 'RESUME_INVALID_DOCUMENT';
                $messages = [
                    'RESUME_PARSER_UNAVAILABLE' => ['The required local parser is unavailable.', 503],
                    'RESUME_UNSUPPORTED_FORMAT' => ['Choose a PDF, DOCX, Markdown or text file.', 422],
                    'RESUME_UPLOAD_TOO_LARGE' => ['The resume must be no larger than 5 MiB.', 413],
                    'RESUME_LIMIT_EXCEEDED' => ['This document exceeds the page, archive or text limit.', 413],
                    'RESUME_NO_TEXT' => ['No readable text was found. Upload a text-based document or use direct entry.', 422],
                    'RESUME_ENCODING_UNSUPPORTED' => ['Use UTF-8 text or UTF-16 with a byte-order marker.', 422],
                    'RESUME_ENCRYPTED' => ['Upload a document without password protection.', 422],
                    'RESUME_INVALID_DOCUMENT' => ['This document is damaged or is not the selected document format.', 422],
                ];
                if (!isset($messages[$code])) { $code = 'RESUME_INVALID_DOCUMENT'; }
                throw new ProfileException($code, $messages[$code][0], $messages[$code][1]);
            }
            if (!is_array($result['result'] ?? null)) { throw new ProfileException('RESUME_INVALID_DOCUMENT', 'The parser returned an invalid result.'); }
            return $result['result'];
        } finally {
            foreach ($pipes as $pipe) { if (is_resource($pipe)) { fclose($pipe); } }
            $state = proc_get_status($process);
            if ($state['running']) { proc_terminate($process, 9); }
            proc_close($process);
        }
    }
}
