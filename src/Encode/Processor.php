<?php

namespace Vizuall\UploadVideo\Encode;

use Illuminate\Support\Facades\Log;
use Vizuall\UploadVideo\Value;

final class Processor
{
    public function queue(array $value): void
    {
        dispatch(function () use ($value) {
            $this->ensure($value);
        })->afterResponse();
    }

    /**
     * @param  array<string, mixed>  $value
     * @return array<string, mixed>|null
     */
    public function describe(array $value, bool $encode): ?array
    {
        $value = $this->prepared($value);

        if ($value === null) {
            return null;
        }

        if ($encode) {
            $this->write($value);
        }

        $mtime = (int) filemtime($this->originalPath($value));
        $videoName = $this->videoName($value, $mtime);
        $posterName = $this->posterName($value, $mtime);

        return [
            'url' => is_file($this->publicDir().'/'.$videoName) ? '/assets/upload-video/'.$videoName : null,
            'poster' => is_file($this->publicDir().'/'.$posterName) ? '/assets/upload-video/'.$posterName : null,
            'poster_at' => $value['poster_at'],
            'size' => $value['size'],
            'quality' => $value['quality'],
            'audio' => $value['audio'],
            'filename' => $value['filename'],
            'duration' => $value['duration'],
            'ready' => is_file($this->publicDir().'/'.$videoName),
        ];
    }

    /**
     * @param  array<string, mixed>  $value
     */
    public function ensure(array $value): void
    {
        $value = $this->prepared($value);

        if ($value !== null) {
            $this->write($value);
        }
    }

    public function delete(string $id): void
    {
        if (! Value::idOk($id)) {
            return;
        }

        foreach (Value::EXTENSIONS as $extension) {
            $path = $this->originalsDir().'/'.$id.'.'.$extension;

            if (is_file($path)) {
                unlink($path);
            }
        }

        $dir = public_path('assets/upload-video');

        if (is_dir($dir)) {
            $this->deleteStale($dir, $id, []);
        }
    }

    /**
     * @param  array<string, mixed>  $value
     * @return array<string, mixed>|null
     */
    private function prepared(array $value): ?array
    {
        $value = Value::normalize($value);

        if ($value === null || $this->originalPath($value) === null) {
            return null;
        }

        if ($value['duration'] === null) {
            $value['duration'] = Ffmpeg::duration($this->originalPath($value));
        }

        $value['poster_at'] = Value::clampPoster((float) $value['poster_at'], $value['duration']);

        return $value;
    }

    /**
     * @param  array<string, mixed>  $value
     */
    private function write(array $value): void
    {
        $lock = $this->lock($value['id']);

        if ($lock === null) {
            return;
        }

        try {
            $original = $this->originalPath($value);
            $dir = $this->publicDir();

            if (! is_dir($dir) && ! mkdir($dir, 0755, true) && ! is_dir($dir)) {
                return;
            }

            $mtime = (int) filemtime($original);
            $videoName = $this->videoName($value, $mtime);
            $posterName = $this->posterName($value, $mtime);
            $videoPath = $dir.'/'.$videoName;
            $posterPath = $dir.'/'.$posterName;

            if (! is_file($videoPath)) {
                try {
                    $this->writeVideo($original, $videoPath, $value);
                } catch (\Throwable $e) {
                    Log::error('upload-video: '.$e->getMessage(), ['id' => $value['id']]);
                }
            }

            if (! is_file($posterPath)) {
                try {
                    $this->writePoster($original, $posterPath, (float) $value['poster_at']);
                } catch (\Throwable $e) {
                    Log::error('upload-video: '.$e->getMessage(), ['id' => $value['id']]);
                }
            }

            $this->deleteStale($dir, $value['id'], [$videoName, $posterName]);
        } catch (\Throwable $e) {
            Log::error('upload-video: '.$e->getMessage(), ['id' => $value['id']]);
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    /**
     * @param  array<string, mixed>  $value
     */
    private function writeVideo(string $original, string $output, array $value): void
    {
        try {
            Ffmpeg::run(Plan::videoArguments(
                $original,
                $output,
                $value['size'],
                $value['quality'],
                $value['audio'],
                $value['extension'],
            ));
        } catch (\Throwable $e) {
            if (is_file($output)) {
                unlink($output);
            }

            throw $e;
        }
    }

    private function writePoster(string $original, string $output, float $seconds): void
    {
        try {
            Ffmpeg::run(Plan::posterArguments($original, $output, $seconds));
        } catch (\Throwable $e) {
            if (is_file($output)) {
                unlink($output);
            }

            throw $e;
        }
    }

    /**
     * @param  array<string, mixed>  $value
     */
    private function videoName(array $value, int $mtime): string
    {
        return $value['id'].'-v'.$this->hash([$value['size'], $value['quality'], $value['audio'] ? 1 : 0, $mtime]).'.mp4';
    }

    /**
     * @param  array<string, mixed>  $value
     */
    private function posterName(array $value, int $mtime): string
    {
        return $value['id'].'-p'.$this->hash([$value['poster_at'], $mtime]).'.jpg';
    }

    private function hash(array $parts): string
    {
        return substr(md5(json_encode($parts)), 0, 10);
    }

    /**
     * @param  list<string>  $keep
     */
    private function deleteStale(string $dir, string $id, array $keep): void
    {
        foreach (glob($dir.'/'.$id.'-*') ?: [] as $file) {
            if (is_file($file) && ! in_array(basename($file), $keep, true)) {
                unlink($file);
            }
        }
    }

    /**
     * @param  array<string, mixed>  $value
     */
    private function originalPath(array $value): ?string
    {
        $path = $this->originalsDir().'/'.$value['id'].'.'.$value['extension'];

        return is_file($path) ? $path : null;
    }

    private function originalsDir(): string
    {
        return storage_path('app/upload-video/originals');
    }

    private function publicDir(): string
    {
        return public_path('assets/upload-video');
    }

    /**
     * @return resource|null
     */
    private function lock(string $id)
    {
        $dir = storage_path('app/upload-video/locks');

        if (! is_dir($dir) && ! mkdir($dir, 0755, true) && ! is_dir($dir)) {
            return null;
        }

        $handle = fopen($dir.'/'.$id.'.lock', 'c');

        if ($handle === false) {
            return null;
        }

        flock($handle, LOCK_EX);

        return $handle;
    }
}
