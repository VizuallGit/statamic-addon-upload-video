<?php

namespace Vizuall\UploadVideo;

use Statamic\Providers\AddonServiceProvider as BaseAddonServiceProvider;

class AddonServiceProvider extends BaseAddonServiceProvider
{
    protected $fieldtypes = [
        Fieldtypes\UploadVideo::class,
    ];

    protected $scripts = [
        __DIR__.'/../resources/js/shrink.js',
        __DIR__.'/../resources/js/addon.js',
    ];

    protected $stylesheets = [
        __DIR__.'/../resources/css/addon.css',
    ];
}
