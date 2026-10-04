<?php

namespace Vizuall\UploadVideo\Http;

use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Str;
use RuntimeException;
use Vizuall\UploadVideo\Chunks;
use Vizuall\UploadVideo\Library;
use Vizuall\UploadVideo\Strings;
use Vizuall\UploadVideo\Value;

class UploadController extends Controller
{
    private const APPLY_MAX_BYTES = 200 * 1024 * 1024;

    public function apply(Request $request)
    {
        Chunks::sweep();

        $assetId = (string) $request->input('asset', '');
        $replace = $request->input('replace');

        if (! Value::acceptedApply($assetId, $replace, $request->input('token'), (string) config('app.key'))) {
            return response()->json(['message' => Strings::line('reload')], 422);
        }

        $file = $request->file('chunk');

        if ($file === null || ! $file->isValid()) {
            return response()->json(['message' => Strings::line('could_not_save')], 422);
        }

        if ($file->getSize() > Value::chunkBytes() + 8192) {
            return response()->json(['message' => Strings::line('chunk_too_big')], 422);
        }

        $extension = strtolower(pathinfo(Value::filename((string) $request->input('filename', '')), PATHINFO_EXTENSION));

        if ($extension !== 'mp4') {
            return response()->json(['message' => Strings::line('could_not_save')], 422);
        }

        $maxBytes = self::APPLY_MAX_BYTES;
        $total = (int) $request->input('total', 0);
        $index = (int) $request->input('index', -1);

        if ($total > Chunks::maxChunks($maxBytes) || $total < 1 || $index < 0 || $index >= $total) {
            return response()->json(['message' => Strings::line('could_not_save')], 422);
        }

        $id = $index === 0 ? (string) Str::uuid() : (string) $request->input('id', '');

        if (! Value::idOk($id)) {
            return response()->json(['message' => Strings::line('could_not_save')], 422);
        }

        try {
            Chunks::store($id, $index, $file);

            if ($index + 1 < $total) {
                return ['id' => $id, 'received' => $index];
            }

            Chunks::finish($id, $total, 'mp4', $maxBytes);
            $replaceFile = filter_var($replace, FILTER_VALIDATE_BOOLEAN);

            if ($replaceFile) {
                return Library::replace($id, $assetId);
            }

            $asset = Library::video($assetId);
            $placed = Library::place(
                $id,
                'mp4',
                pathinfo($asset->basename(), PATHINFO_FILENAME).'.mp4',
                $asset->container()->handle(),
                Library::folderOf($asset),
            );
            $saved = Library::video($placed['asset']);

            return Library::describe($saved);
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function posterAsset(Request $request)
    {
        $file = $request->file('poster');
        $mime = $file ? (string) $file->getMimeType() : '';

        if ($file === null || ! $file->isValid() || ! in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
            return response()->json(['message' => Strings::line('poster_must_be_image')], 422);
        }

        $contents = file_get_contents($file->getRealPath());

        if ($contents === false) {
            return response()->json(['message' => Strings::line('poster_failed')], 500);
        }

        try {
            return ['poster' => Library::poster(
                (string) $request->input('asset', ''),
                $contents,
                $request->boolean('overwrite'),
            )];
        } catch (RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 404);
        }
    }

}
