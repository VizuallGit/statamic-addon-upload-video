<?php

namespace Vizuall\UploadVideo\Http;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Vizuall\UploadVideo\Encode\Ffmpeg;
use Vizuall\UploadVideo\Encode\Processor;
use Vizuall\UploadVideo\Value;

class UploadController extends Controller
{
    public function store(Request $request)
    {
        $file = $request->file('video');

        if ($file === null || ! $file->isValid()) {
            return response()->json(['message' => 'Vælg en videofil.'], 422);
        }

        $extension = strtolower($file->getClientOriginalExtension());
        $mime = (string) $file->getMimeType();

        if (! in_array($extension, Value::EXTENSIONS, true) || ! str_starts_with($mime, 'video/')) {
            return response()->json(['message' => 'Kun videofiler (mp4, webm, mov).'], 422);
        }

        $id = (string) \Illuminate\Support\Str::uuid();
        $directory = storage_path('app/upload-video/originals');

        if (! is_dir($directory) && ! mkdir($directory, 0755, true) && ! is_dir($directory)) {
            return response()->json(['message' => 'Videoen kunne ikke gemmes.'], 500);
        }

        $file->move($directory, $id.'.'.$extension);

        $path = $directory.'/'.$id.'.'.$extension;
        $duration = Ffmpeg::duration($path);

        return [
            'id' => $id,
            'filename' => Value::filename($file->getClientOriginalName()),
            'extension' => $extension,
            'duration' => $duration,
            'poster_at' => Value::clampPoster(1, $duration),
            'size' => 720,
            'quality' => 'standard',
            'audio' => true,
        ];
    }

    public function destroy(string $id, Processor $processor)
    {
        if (! Value::idOk($id)) {
            return response()->json(['message' => 'Ukendt video.'], 404);
        }

        $processor->delete($id);

        return response()->noContent();
    }

    public function preview(string $id): StreamedResponse
    {
        if (! Value::idOk($id)) {
            abort(404);
        }

        $path = null;

        foreach (Value::EXTENSIONS as $extension) {
            $candidate = storage_path('app/upload-video/originals/'.$id.'.'.$extension);

            if (is_file($candidate)) {
                $path = $candidate;
                break;
            }
        }

        if ($path === null) {
            abort(404);
        }

        $size = filesize($path);
        $start = 0;
        $end = $size - 1;
        $status = 200;

        if (preg_match('/bytes=(\d*)-(\d*)/', (string) request()->header('Range'), $matches)) {
            if ($matches[1] === '' && $matches[2] !== '') {
                $start = max(0, $size - (int) $matches[2]);
            } else {
                $start = (int) $matches[1];
                if ($matches[2] !== '') {
                    $end = (int) $matches[2];
                }
            }

            $end = min($end, $size - 1);

            if ($start > $end || $start >= $size) {
                return response()->stream(function () {}, 416, [
                    'Content-Range' => 'bytes */'.$size,
                ]);
            }

            $status = 206;
        }

        $length = $end - $start + 1;
        $type = [
            'mp4' => 'video/mp4',
            'm4v' => 'video/mp4',
            'webm' => 'video/webm',
            'mov' => 'video/quicktime',
            'ogv' => 'video/ogg',
        ][pathinfo($path, PATHINFO_EXTENSION)] ?? 'application/octet-stream';

        $headers = [
            'Content-Type' => $type,
            'Accept-Ranges' => 'bytes',
            'Content-Length' => (string) $length,
            'Cache-Control' => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
        ];

        if ($status === 206) {
            $headers['Content-Range'] = 'bytes '.$start.'-'.$end.'/'.$size;
        }

        return response()->stream(function () use ($path, $start, $length) {
            $handle = fopen($path, 'rb');

            if ($handle === false) {
                return;
            }

            fseek($handle, $start);
            $remaining = $length;

            while ($remaining > 0 && ! feof($handle)) {
                $chunk = fread($handle, min(1024 * 64, $remaining));

                if ($chunk === false || $chunk === '') {
                    break;
                }

                echo $chunk;
                $remaining -= strlen($chunk);

                if (connection_aborted()) {
                    break;
                }
            }

            fclose($handle);
        }, $status, $headers);
    }
}
