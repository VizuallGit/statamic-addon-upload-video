<?php

namespace Vizuall\UploadVideo\Encode;

use Vizuall\UploadVideo\Chunks;
use Vizuall\UploadVideo\Value;

/**
 * The published files are the uploaded video and a JPEG the browser captured.
 * A normal PHP server does not transcode video.
 */
final class Processor
{
    /**
     * @param  array<string, mixed>  $value
     * @return array<string, mixed>|null
     */
    public function describe(array $value, bool $encode = false): ?array
    {
        $value = Value::normalize($value);

        if ($value === null) {
            return null;
        }

        $videoName = $value['id'].'.'.$value['extension'];
        $posterName = $value['id'].'.jpg';
        $dir = $this->publicDir();

        return [
            'url' => is_file($dir.'/'.$videoName) ? '/assets/upload-video/'.$videoName : null,
            'poster' => is_file($dir.'/'.$posterName) ? '/assets/upload-video/'.$posterName : null,
            'poster_at' => $value['poster_at'],
            'filename' => $value['filename'],
            'duration' => $value['duration'],
            'ready' => is_file($dir.'/'.$videoName),
        ];
    }

    public function delete(string $id): void
    {
        if (! Value::idOk($id)) {
            return;
        }

        $dir = $this->publicDir();

        if (is_dir($dir)) {
            foreach (glob($dir.'/'.$id.'.*') ?: [] as $file) {
                if (is_file($file)) {
                    unlink($file);
                }
            }

            foreach (glob($dir.'/'.$id.'-*') ?: [] as $file) {
                if (is_file($file)) {
                    unlink($file);
                }
            }
        }

        Chunks::forget($id);

        $originals = storage_path('app/upload-video/originals');

        foreach (Value::EXTENSIONS as $extension) {
            $path = $originals.'/'.$id.'.'.$extension;

            if (is_file($path)) {
                unlink($path);
            }
        }
    }

    public static function publicDir(): string
    {
        return public_path('assets/upload-video');
    }
}
