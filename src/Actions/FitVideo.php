<?php

namespace Vizuall\UploadVideo\Actions;

use Statamic\Actions\Action;
use Statamic\Contracts\Assets\Asset;
use Vizuall\UploadVideo\Library;
use Vizuall\UploadVideo\Strings;
use Vizuall\UploadVideo\Value;

class FitVideo extends Action
{
    protected $icon = 'video';

    protected $component = 'vzl-fit-video-preview';

    public static function title()
    {
        return Strings::line('fit_video');
    }

    public function visibleTo($item)
    {
        return $item instanceof Asset && $item->isVideo();
    }

    public function visibleToBulk($items)
    {
        return false;
    }

    public function authorize($user, $item)
    {
        return $item instanceof Asset
            && $user->can('view', $item)
            && $user->can('store', [Asset::class, $item->container()]);
    }

    public function buttonText()
    {
        return Strings::line('save');
    }

    public function confirmationText()
    {
        return Strings::line('confirmation');
    }

    public function run($assets, $values)
    {
        $asset = $assets->first();

        if (! $asset instanceof Asset || ! $asset->isVideo()) {
            throw new \RuntimeException(Strings::line('pick_video'));
        }

        $copy = array_key_exists('copy', $values) ? Value::audio($values['copy']) : true;
        $size = (int) ($values['size'] ?? 720);
        $size = $size === 1080 ? 1080 : 720;
        $start = max(0, (int) ($values['start'] ?? 0));
        $end = $values['end'] ?? null;
        $end = $end === null || $end === '' ? null : max(0, (int) $end);

        if ($end !== null && $end <= $start) {
            throw new \RuntimeException(Strings::line('end_after_start'));
        }

        $poster = self::posterInside($start, $end, $values['poster'] ?? 0);

        if (! $copy && strtolower($asset->extension()) !== 'mp4') {
            throw new \RuntimeException(Strings::line('replace_mp4'));
        }

        Library::video($asset->id());

        return [
            'message' => Strings::line('shrinking'),
            'callback' => ['vzlEncodeAssetVideo', [
                'url' => $asset->url(),
                'filename' => pathinfo($asset->basename(), PATHINFO_FILENAME).'.mp4',
                'uploadUrl' => cp_route('upload-video.apply'),
                'asset' => $asset->id(),
                'replace' => ! $copy,
                'token' => Value::applyToken($asset->id(), ! $copy, (string) config('app.key')),
                'chunkBytes' => Value::chunkBytes(),
                'size' => $size,
                'quality' => Value::quality($values['quality'] ?? Value::DEFAULT_QUALITY),
                'audio' => ! Value::audio($values['mute'] ?? false),
                'start' => $start,
                'end' => $end,
                'poster' => $poster,
            ]],
        ];
    }

    private static function posterInside(int $start, ?int $end, $poster): int
    {
        $frame = max($start, (int) $poster);

        if ($end !== null) {
            $frame = min($end, $frame);
        }

        return $frame;
    }

    protected function fieldItems()
    {
        return [
            'size' => [
                'display' => Strings::line('resolution'),
                'instructions' => Strings::line('resolution_help'),
                'type' => 'select',
                'default' => '720',
                'options' => [
                    '720' => '720p',
                    '1080' => '1080p',
                ],
            ],
            'quality' => [
                'display' => Strings::line('quality'),
                'instructions' => Strings::line('quality_help'),
                'type' => 'range',
                'min' => 10,
                'max' => 100,
                'step' => 10,
                'default' => Value::DEFAULT_QUALITY,
                'append' => '%',
            ],
            'mute' => [
                'display' => Strings::line('mute'),
                'instructions' => Strings::line('mute_help'),
                'type' => 'toggle',
                'default' => false,
            ],
            'start' => [
                'type' => 'hidden',
                'default' => 0,
            ],
            'end' => [
                'type' => 'hidden',
            ],
            'poster' => [
                'type' => 'hidden',
                'default' => 0,
            ],
            'copy' => [
                'display' => Strings::line('copy'),
                'instructions' => Strings::line('copy_help'),
                'type' => 'toggle',
                'default' => true,
            ],
        ];
    }
}
