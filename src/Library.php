<?php

namespace Vizuall\UploadVideo;

use RuntimeException;
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
            throw new RuntimeException('Mappen blev ikke fundet.');
        }

        $user = User::current();

        if ($user === null || ! $user->can('store', [AssetContract::class, $container])) {
            throw new RuntimeException('Du kan ikke uploade til den mappe.');
        }

        $source = Processor::publicDir().'/'.$id.'.'.$extension;

        if (! is_file($source)) {
            throw new RuntimeException('Videoen kunne ikke gemmes.');
        }

        $contents = file_get_contents($source);

        if ($contents === false) {
            throw new RuntimeException('Videoen kunne ikke gemmes.');
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

    public static function poster(string $assetId, string $contents): string
    {
        if (! Value::assetOk($assetId)) {
            throw new RuntimeException('Ukendt video.');
        }

        $asset = Asset::find($assetId);

        if ($asset === null) {
            throw new RuntimeException('Ukendt video.');
        }

        $user = User::current();

        if ($user === null || ! $user->can('view', $asset)) {
            throw new RuntimeException('Ukendt video.');
        }

        $path = preg_replace('/\.[^.]+$/', '.poster.jpg', $asset->path()) ?? '';
        $asset->container()->disk()->put($path, $contents);

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
                throw new RuntimeException('Videoen kunne ikke gemmes.');
            }

            $path = $prefix.$name.'-'.$try.'.'.$extension;
            $try++;
        }

        return $path;
    }
}
