<?php

namespace Vizuall\UploadVideo\Modifiers;

use Statamic\Contracts\Assets\Asset as AssetContract;
use Statamic\Facades\Asset;
use Statamic\Facades\Glide;
use Statamic\Facades\Image;
use Statamic\Modifiers\Modifier;
use Vizuall\UploadVideo\Library;
use Vizuall\UploadVideo\Value;

class VideoPoster extends Modifier
{
    /**
     * The poster JPEG saved beside a video in the asset library.
     *
     * {{ video | video_poster }}
     * {{ video | video_poster:30:webp }}
     */
    public function index($value, $params, $context)
    {
        $asset = $this->asset($value);

        if ($asset === null) {
            return null;
        }

        $url = Library::posterUrl($asset);

        if ($url === null) {
            return null;
        }

        $adjustments = Value::posterAdjustments(is_array($params) ? $params : []);

        if ($adjustments === []) {
            return $url;
        }

        $poster = $asset->container()->asset(Library::posterPath($asset));

        return Image::manipulate($poster ?? $url, Glide::normalizeParameters($adjustments));
    }

    private function asset(mixed $value): ?AssetContract
    {
        if ($value instanceof AssetContract) {
            return $value->isVideo() ? $value : null;
        }

        if (is_array($value)) {
            if (isset($value['id']) && is_string($value['id'])) {
                return $this->asset($value['id']);
            }

            return $this->asset($value[0] ?? null);
        }

        if (! is_string($value) || $value === '') {
            return null;
        }

        $found = Asset::find($value);

        return $found instanceof AssetContract && $found->isVideo() ? $found : null;
    }
}
