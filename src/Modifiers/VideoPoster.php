<?php

namespace Vizuall\UploadVideo\Modifiers;

use Statamic\Contracts\Assets\Asset as AssetContract;
use Statamic\Facades\Asset;
use Statamic\Modifiers\Modifier;
use Vizuall\UploadVideo\Library;

class VideoPoster extends Modifier
{
    /**
     * The poster JPEG saved beside a video in the asset library.
     *
     * {{ video | video_poster }}
     */
    public function index($value, $params, $context)
    {
        $asset = $this->asset($value);

        return $asset === null ? null : Library::posterUrl($asset);
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
