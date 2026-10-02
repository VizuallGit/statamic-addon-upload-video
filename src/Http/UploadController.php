<?php

namespace Vizuall\UploadVideo\Http;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Str;
use RuntimeException;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Vizuall\UploadVideo\Chunks;
use Vizuall\UploadVideo\Encode\Processor;
use Vizuall\UploadVideo\Value;

class UploadController extends Controller
{
    public function store(Request $request)
    {
        Chunks::sweep();

        $file = $request->file('chunk');

        if ($file === null || ! $file->isValid()) {
            $code = $file ? $file->getError() : \UPLOAD_ERR_NO_FILE;

            if (in_array($code, [\UPLOAD_ERR_INI_SIZE, \UPLOAD_ERR_FORM_SIZE], true)) {
                return response()->json(['message' => 'Serveren afviser så stor en del af filen. Genindlæs siden og prøv igen.'], 422);
            }

            return response()->json(['message' => 'Vælg en videofil.'], 422);
        }

        if ($file->getSize() > Value::chunkBytes() + 8192) {
            return response()->json(['message' => 'Serveren afviser så stor en del af filen. Genindlæs siden og prøv igen.'], 422);
        }

        $filename = Value::filename((string) $request->input('filename', ''));
        $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));

        if (! in_array($extension, Value::EXTENSIONS, true)) {
            return response()->json(['message' => 'Kun videofiler (mp4, webm, mov).'], 422);
        }

        $maxBytes = Value::acceptedMax($request->input('max_bytes'), $request->input('max_token'), (string) config('app.key'));

        if ($maxBytes === null) {
            return response()->json(['message' => 'Genindlæs siden og prøv igen.'], 422);
        }

        $total = (int) $request->input('total', 0);
        $index = (int) $request->input('index', -1);

        if ($total > Chunks::maxChunks($maxBytes)) {
            return response()->json(['message' => Chunks::tooBigMessage($maxBytes)], 422);
        }

        if ($total < 1 || $index < 0 || $index >= $total) {
            return response()->json(['message' => 'Videoen kunne ikke uploades.'], 422);
        }

        $id = $index === 0 ? (string) Str::uuid() : (string) $request->input('id', '');

        if (! Value::idOk($id)) {
            return response()->json(['message' => 'Videoen kunne ikke uploades.'], 422);
        }

        try {
            Chunks::store($id, $index, $file);

            if ($index + 1 < $total) {
                return ['id' => $id, 'received' => $index];
            }

            Chunks::finish($id, $total, $extension, $maxBytes);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 500);
        }

        return [
            'id' => $id,
            'filename' => $filename,
            'extension' => $extension,
            'poster_at' => 1,
        ];
    }

    public function poster(string $id, Request $request)
    {
        if (! Value::idOk($id)) {
            return response()->json(['message' => 'Ukendt video.'], 404);
        }

        $file = $request->file('poster');
        $mime = $file ? (string) $file->getMimeType() : '';

        if ($file === null || ! $file->isValid() || ! in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
            return response()->json(['message' => 'Poster skal være et billede.'], 422);
        }

        $directory = Processor::publicDir();

        if (! is_dir($directory) && ! mkdir($directory, 0755, true) && ! is_dir($directory)) {
            return response()->json(['message' => 'Poster kunne ikke gemmes.'], 500);
        }

        $file->move($directory, $id.'.jpg');

        return ['poster' => '/assets/upload-video/'.$id.'.jpg'];
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
