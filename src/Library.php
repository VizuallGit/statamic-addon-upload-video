<?php

namespace Vizuall\UploadVideo;

use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Statamic\Assets\ReplacementFile;
use Statamic\Contracts\Assets\Asset as AssetContract;
use Statamic\Facades\Asset;
use Statamic\Facades\AssetContainer;
use Statamic\Facades\User;
use Statamic\Support\Str;
use Vizuall\UploadVideo\Encode\Processor;

/**
 * A processed video is a normal asset in the folder chosen on the field.
 */
final class Library
{
    /**
     * @return array{asset: string, filename: string, extension: string, url: string, filesize: string}
     */
    public static function place(string $id, string $extension, string $filename, string $containerHandle, string $folder): array
    {
        $container = AssetContainer::find($containerHandle);

        if ($container === null) {
            throw new RuntimeException(Strings::line('folder_missing'));
        }

        $user = User::current();

        if ($user === null || ! $user->can('store', [AssetContract::class, $container])) {
            throw new RuntimeException(Strings::line('cannot_upload'));
        }

        $source = Processor::publicDir().'/'.$id.'.'.$extension;

        if (! is_file($source)) {
            throw new RuntimeException(Strings::line('could_not_save'));
        }

        $contents = file_get_contents($source);

        if ($contents === false) {
            throw new RuntimeException(Strings::line('could_not_save'));
        }

        $path = self::uniquePath($container, $folder, $filename, $extension);
        $container->disk()->put($path, $contents);
        $asset = $container->makeAsset($path);
        $asset->save();
        unlink($source);

        return [
            'asset' => $asset->id(),
            'filename' => $asset->basename(),
            'extension' => $extension,
            'url' => (string) $asset->url(),
            'filesize' => Str::fileSizeForHumans($asset->size()),
        ];
    }

    /**
     * @return array{asset: string, filename: string, extension: string, url: string, filesize: string, edit_url: string}
     */
    public static function replace(string $id, string $assetId): array
    {
        $asset = self::video($assetId);
        $user = User::current();

        if ($user === null || ! $user->can('reupload', $asset)) {
            throw new RuntimeException(Strings::line('cannot_replace'));
        }

        if (strtolower($asset->extension()) !== 'mp4') {
            throw new RuntimeException(Strings::line('replace_mp4_copy'));
        }

        $source = Processor::publicDir().'/'.$id.'.mp4';

        if (! is_file($source)) {
            throw new RuntimeException(Strings::line('could_not_save'));
        }

        $contents = file_get_contents($source);

        if ($contents === false) {
            throw new RuntimeException(Strings::line('could_not_save'));
        }

        $base = config('statamic.system.file_uploads_path', 'statamic/file-uploads');
        $relative = $base.'/'.$id.'.mp4';
        $disk = Storage::disk(config('statamic.system.file_uploads_disk', 'local'));
        $disk->put($relative, $contents);
        $asset->reupload(new ReplacementFile($relative));
        $disk->delete($relative);
        $poster = self::posterPath($asset);

        if ($poster !== '' && $asset->container()->disk()->exists($poster)) {
            $asset->container()->disk()->delete($poster);
        }

        if (is_file($source)) {
            unlink($source);
        }

        return self::describe($asset);
    }

    /**
     * @return array{asset: string, filename: string, extension: string, url: string, filesize: string, edit_url: string}
     */
    public static function describe($asset): array
    {
        return [
            'asset' => $asset->id(),
            'filename' => $asset->basename(),
            'extension' => strtolower($asset->extension()),
            'url' => (string) $asset->url(),
            'filesize' => Str::fileSizeForHumans($asset->size()),
            'edit_url' => cp_route('assets.browse.edit', [
                'asset_container' => $asset->container()->handle(),
                'path' => $asset->path(),
            ]),
        ];
    }

    public static function video(string $assetId): AssetContract
    {
        if (! Value::assetOk($assetId)) {
            throw new RuntimeException(Strings::line('unknown_video'));
        }

        $asset = Asset::find($assetId);

        if ($asset === null || ! $asset->isVideo()) {
            throw new RuntimeException(Strings::line('unknown_video'));
        }

        return $asset;
    }

    public static function folderOf($asset): string
    {
        $path = str_replace('\\', '/', $asset->path());
        $folder = dirname($path);

        return $folder === '.' ? '' : $folder;
    }

    public static function poster(string $assetId, string $contents, bool $overwrite = false): string
    {
        $asset = self::video($assetId);
        $user = User::current();

        if ($user === null || ! $user->can('view', $asset)) {
            throw new RuntimeException(Strings::line('unknown_video'));
        }

        if ($overwrite && ! $user->can('store', [AssetContract::class, $asset->container()])) {
            throw new RuntimeException(Strings::line('poster_failed'));
        }

        $path = self::posterPath($asset);
        $url = self::posterPublicUrl($asset);

        if ($path === '' || $url === '') {
            throw new RuntimeException(Strings::line('poster_failed'));
        }

        if ($overwrite || ! $asset->container()->disk()->exists($path)) {
            $asset->container()->disk()->put($path, $contents);
        }

        return $url;
    }

    public static function posterUrl($asset): ?string
    {
        if ($asset === null || ! $asset->isVideo()) {
            return null;
        }

        $path = self::posterPath($asset);

        if ($path === '' || ! $asset->container()->disk()->exists($path)) {
            return null;
        }

        $url = self::posterPublicUrl($asset);

        return $url === '' ? null : $url;
    }

    public static function posterPath($asset): string
    {
        return preg_replace('/\.[^.]+$/', '.poster.jpg', (string) $asset->path()) ?? '';
    }

    private static function posterPublicUrl($asset): string
    {
        return preg_replace('/\.[^.]+$/', '.poster.jpg', (string) $asset->url()) ?? '';
    }

    private static function uniquePath($container, string $folder, string $filename, string $extension): string
    {
        $name = pathinfo(Value::filename($filename), PATHINFO_FILENAME);
        $name = $name !== '' ? $name : 'video';
        $prefix = $folder === '' ? '' : $folder.'/';
        $path = $prefix.$name.'.'.$extension;
        $try = 2;

        while ($container->disk()->exists($path)) {
            if ($try > 50) {
                throw new RuntimeException(Strings::line('could_not_save'));
            }

            $path = $prefix.$name.'-'.$try.'.'.$extension;
            $try++;
        }

        return $path;
    }
}
