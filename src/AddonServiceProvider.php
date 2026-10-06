<?php

namespace Vizuall\UploadVideo;

use Statamic\Providers\AddonServiceProvider as BaseAddonServiceProvider;
use Statamic\Statamic;

class AddonServiceProvider extends BaseAddonServiceProvider
{
    protected $scripts = [
        __DIR__.'/../resources/js/shrink.js',
    ];

    /**
     * addon.js is registered by hand below (with a cache-busting hash), so it
     * has to be named here too: Statamic only publishes after `composer
     * install/update` what an addon lists in `$scripts`, `$stylesheets`,
     * `$vite` or `$publishables`. Without this, public/vendor kept whatever
     * copy was put there by hand and every update left the old script running.
     */
    protected $publishables = [
        __DIR__.'/../resources/js/addon.js' => 'js/addon.js',
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
