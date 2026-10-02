<?php

namespace Vizuall\UploadVideo\Encode;

use Symfony\Component\Process\Process;

final class Ffmpeg
{
    private static ?string $binary = null;

    private static bool $resolved = false;

    public static function binary(): ?string
    {
        if (self::$resolved) {
            return self::$binary;
        }

        self::$resolved = true;

        $configured = config('statamic.assets.ffmpeg.binary');

        if (is_string($configured) && $configured !== '' && is_executable($configured)) {
            return self::$binary = $configured;
        }

        $found = self::which('ffmpeg');

        if ($found === null && PHP_OS_FAMILY === 'Darwin') {
            foreach (['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'] as $path) {
                if (is_executable($path)) {
                    $found = $path;
                    break;
                }
            }
        }

        return self::$binary = $found;
    }

    public static function ffprobe(): ?string
    {
        $ffmpeg = self::binary();

        if ($ffmpeg === null) {
            return null;
        }

        $probe = dirname($ffmpeg).'/ffprobe';

        return is_executable($probe) ? $probe : self::which('ffprobe');
    }

    public static function run(array $arguments): void
    {
        $binary = self::binary();

        if ($binary === null) {
            throw new \RuntimeException('ffmpeg blev ikke fundet.');
        }

        $process = new Process(array_merge([$binary], $arguments));
        $process->setTimeout(null);
        $process->run();

        if (! $process->isSuccessful()) {
            throw new \RuntimeException(trim($process->getErrorOutput()) ?: 'ffmpeg fejlede.');
        }
    }

    public static function duration(string $path): ?float
    {
        $probe = self::ffprobe();

        if ($probe === null || ! is_file($path)) {
            return null;
        }

        $process = new Process([
            $probe,
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            $path,
        ]);
        $process->setTimeout(30);
        $process->run();

        if (! $process->isSuccessful()) {
            return null;
        }

        $seconds = (float) trim($process->getOutput());

        return $seconds > 0 ? $seconds : null;
    }

    private static function which(string $command): ?string
    {
        $process = new Process([PHP_OS_FAMILY === 'Windows' ? 'where' : 'which', $command]);
        $process->run();

        if (! $process->isSuccessful()) {
            return null;
        }

        $path = trim(strtok($process->getOutput(), "\r\n") ?: '');

        return ($path !== '' && is_executable($path)) ? $path : null;
    }
}
