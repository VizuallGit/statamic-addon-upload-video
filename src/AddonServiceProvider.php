<?php

namespace Vizuall\UploadVideo;

use Statamic\Providers\AddonServiceProvider as BaseAddonServiceProvider;

class AddonServiceProvider extends BaseAddonServiceProvider
{
    protected $scripts = [
        __DIR__.'/../resources/js/shrink.js',
        __DIR__.'/../resources/js/addon.js',
    ];
}
