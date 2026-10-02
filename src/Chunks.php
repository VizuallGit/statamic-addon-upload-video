<?php

namespace Vizuall\UploadVideo;

use Illuminate\Http\UploadedFile;
use RuntimeException;
use Vizuall\UploadVideo\Encode\Processor;

/**
 * A video is stored from several small requests, then joined into one file.
 * Each request stays under PHP's upload limit. The finished file cannot pass the max.
 */
final class Chunks
{
    public static function tooBigMessage(int $maxBytes): string
    {
        $mb = (int) round($maxBytes / (1024 * 1024));

        return 'Videoen må højst være '.$mb.' MB.';
    }

    public static function directory(string $id): string
    {
        return storage_path('app/upload-video/parts/'.$id);
    }

    public static function maxChunks(int $maxBytes): int
    {
        return max(1, (int) ceil($maxBytes / max(1, Value::chunkBytes())));
    }

    public static function store(string $id, int $index, UploadedFile $file): void
    {
        $dir = self::directory($id);

        if (! is_dir($dir) && ! mkdir($dir, 0755, true) && ! is_dir($dir)) {
            throw new RuntimeException('Videoen kunne ikke gemmes.');
        }

        $file->move($dir, (string) $index);
    }

    public static function finish(string $id, int $total, string $extension, int $maxBytes): void
    {
        $dir = self::directory($id);
        $bytes = 0;

        for ($i = 0; $i < $total; $i++) {
            $part = $dir.'/'.$i;

            if (! is_file($part)) {
                self::forget($id);
                throw new RuntimeException('Upload afbrudt. Prøv igen.');
            }

            $bytes += filesize($part) ?: 0;
        }

        if ($bytes < 1 || $bytes > $maxBytes) {
            self::forget($id);
            throw new RuntimeException($bytes < 1 ? 'Vælg en videofil.' : self::tooBigMessage($maxBytes));
        }

        $public = Processor::publicDir();

        if (! is_dir($public) && ! mkdir($public, 0755, true) && ! is_dir($public)) {
            throw new RuntimeException('Videoen kunne ikke gemmes.');
        }

        $dest = $public.'/'.$id.'.'.$extension;
        $out = fopen($dest, 'wb');

        if ($out === false) {
            throw new RuntimeException('Videoen kunne ikke gemmes.');
        }

        try {
            for ($i = 0; $i < $total; $i++) {
                $in = fopen($dir.'/'.$i, 'rb');

                if ($in === false) {
                    throw new RuntimeException('Upload afbrudt. Prøv igen.');
                }

                stream_copy_to_stream($in, $out);
                fclose($in);
            }
        } catch (\Throwable $e) {
            fclose($out);

            if (is_file($dest)) {
                unlink($dest);
            }

            self::forget($id);
            throw $e;
        }

        fclose($out);

        $head = (string) file_get_contents($dest, false, null, 0, 64);

        if (! Value::videoSignatureOk($head, $extension)) {
            unlink($dest);
            self::forget($id);
            throw new RuntimeException('Kun videofiler (mp4, webm, mov).');
        }

        self::forget($id);
    }

    public static function forget(string $id): void
    {
        if (! Value::idOk($id)) {
            return;
        }

        $dir = self::directory($id);

        if (! is_dir($dir)) {
            return;
        }

        foreach (glob($dir.'/*') ?: [] as $file) {
            if (is_file($file)) {
                unlink($file);
            }
        }

        rmdir($dir);
    }

    public static function sweep(): void
    {
        $root = storage_path('app/upload-video/parts');

        if (! is_dir($root)) {
            return;
        }

        $cutoff = time() - 86400;

        foreach (glob($root.'/*', GLOB_ONLYDIR) ?: [] as $dir) {
            $mtime = filemtime($dir);

            if ($mtime !== false && $mtime < $cutoff) {
                self::forget(basename($dir));
            }
        }
    }
}
