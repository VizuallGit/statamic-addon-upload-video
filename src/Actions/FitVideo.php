<?php

namespace Vizuall\UploadVideo\Actions;

use Statamic\Actions\Action;
use Statamic\Contracts\Assets\Asset;
use Vizuall\UploadVideo\Library;
use Vizuall\UploadVideo\Value;

class FitVideo extends Action
{
    protected $icon = 'video';

    protected $component = 'vzl-fit-video-preview';

    public static function title()
    {
        return 'Tilpas video';
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
        return 'Gem';
    }

    public function confirmationText()
    {
        return 'Browseren laver videoen, når du gemmer. Det kan tage et øjeblik.';
    }

    public function run($assets, $values)
    {
        $asset = $assets->first();

        if (! $asset instanceof Asset || ! $asset->isVideo()) {
            throw new \RuntimeException('Vælg en videofil.');
        }

        $copy = array_key_exists('copy', $values) ? Value::audio($values['copy']) : true;
        $size = (int) ($values['size'] ?? 720);
        $size = $size === 1080 ? 1080 : 720;
        $start = max(0, (int) ($values['start'] ?? 0));
        $end = $values['end'] ?? null;
        $end = $end === null || $end === '' ? null : max(0, (int) $end);

        if ($end !== null && $end <= $start) {
            throw new \RuntimeException('Slut skal ligge efter start.');
        }

        if (! $copy && strtolower($asset->extension()) !== 'mp4') {
            throw new \RuntimeException('Erstat virker kun på en mp4. Slå Gem som kopi til.');
        }

        Library::video($asset->id());

        return [
            'message' => 'Gør videoen mindre…',
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
            ]],
        ];
    }

    protected function fieldItems()
    {
        return [
            'size' => [
                'display' => 'Opløsning',
                'instructions' => 'En større video skaleres ned hertil. En mindre video bliver ikke forstørret.',
                'type' => 'select',
                'default' => '720',
                'options' => [
                    '720' => '720p',
                    '1080' => '1080p',
                ],
            ],
            'quality' => [
                'display' => 'Kvalitet',
                'instructions' => 'Fra 10 % til 100 %. Lavere kvalitet giver en mindre fil.',
                'type' => 'range',
                'min' => 10,
                'max' => 100,
                'step' => 10,
                'default' => Value::DEFAULT_QUALITY,
                'append' => '%',
            ],
            'mute' => [
                'display' => 'Uden lyd',
                'instructions' => 'Lyden fjernes i den gemte video.',
                'type' => 'toggle',
                'default' => false,
            ],
            'start' => [
                'display' => 'Start (sekunder)',
                'instructions' => '0 starter fra begyndelsen.',
                'type' => 'integer',
                'default' => 0,
                'validate' => 'nullable|integer|min:0',
            ],
            'end' => [
                'display' => 'Slut (sekunder)',
                'instructions' => 'Tom betyder, at videoen kører til den slutter.',
                'type' => 'integer',
                'validate' => 'nullable|integer|min:1',
            ],
            'copy' => [
                'display' => 'Gem som kopi',
                'instructions' => 'Slået til beholder originalen. Slået fra erstatter mp4-filen.',
                'type' => 'toggle',
                'default' => true,
            ],
        ];
    }
}
