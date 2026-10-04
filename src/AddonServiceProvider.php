<?php

namespace Vizuall\UploadVideo;

use Statamic\Providers\AddonServiceProvider as BaseAddonServiceProvider;
use Statamic\Statamic;

class AddonServiceProvider extends BaseAddonServiceProvider
{
    protected $scripts = [
        __DIR__.'/../resources/js/shrink.js',
        __DIR__.'/../resources/js/addon.js',
    ];

    public function bootAddon()
    {
        Statamic::provideToScript([
            'vzlFitStrings' => fn () => Strings::forScript(),
        ]);
    }
}
