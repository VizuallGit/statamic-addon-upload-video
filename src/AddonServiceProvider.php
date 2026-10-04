<?php

namespace Vizuall\UploadVideo;

use Statamic\Providers\AddonServiceProvider as BaseAddonServiceProvider;
use Statamic\Statamic;

class AddonServiceProvider extends BaseAddonServiceProvider
{
    protected $scripts = [
        __DIR__.'/../resources/js/shrink.js',
    ];

    public function bootAddon()
    {
        $js = __DIR__.'/../resources/js/addon.js';
        Statamic::script($this->getAddon()->packageName(), 'addon.js?v='.substr(md5_file($js), 0, 12));

        Statamic::provideToScript([
            'vzlFitStrings' => fn () => Strings::forScript(),
        ]);
    }
}
