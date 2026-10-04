<?php

namespace Vizuall\UploadVideo;

use Statamic\Facades\User;

final class Strings
{
    /**
     * English is the base. The Control Panel user's language overrides it.
     *
     * @return array<string, string>
     */
    public static function forScript(): array
    {
        $locale = User::current()?->preferredLocale() ?? config('app.locale', 'en');

        return array_merge(
            (array) trans('upload-video::messages', [], 'en'),
            (array) trans('upload-video::messages', [], $locale),
        );
    }

    public static function line(string $key, array $replace = []): string
    {
        return __('upload-video::messages.'.$key, $replace);
    }
}
