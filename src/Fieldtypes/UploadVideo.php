<?php

namespace Vizuall\UploadVideo\Fieldtypes;

use Statamic\Fields\Fieldtype;
use Vizuall\UploadVideo\Encode\Processor;
use Vizuall\UploadVideo\Value;

class UploadVideo extends Fieldtype
{
    protected static $handle = 'upload_video';

    protected static $title = 'Upload video';

    protected $categories = ['media'];

    protected $icon = 'fieldtype-video';

    protected $keywords = ['video', 'upload', 'poster', 'mp4'];

    protected $selectableInForms = false;

    public function component(): string
    {
        return 'upload-video';
    }

    protected function configFieldItems(): array
    {
        return [
            [
                'display' => 'Video',
                'fields' => [
                    'max_mb' => [
                        'display' => 'Maks. størrelse',
                        'instructions' => 'Største fil i MB. Teksten ved upload viser præcis dette tal, og en større fil bliver afvist.',
                        'type' => 'integer',
                        'default' => Value::DEFAULT_MB,
                        'validate' => 'required|integer|min:1|max:1024',
                        'width' => 50,
                    ],
                    'size' => [
                        'display' => 'Opløsning',
                        'instructions' => 'En større video skaleres ned hertil. En mindre video bliver ikke forstørret.',
                        'type' => 'select',
                        'default' => '720',
                        'options' => [
                            '720' => '720p',
                            '1080' => '1080p',
                        ],
                        'width' => 50,
                    ],
                    'quality' => [
                        'display' => 'Kvalitet',
                        'instructions' => 'Fra 10 % til 100 %, i spring på 10. Lavere kvalitet giver en mindre fil. 10 % passer til en baggrundsvideo.',
                        'type' => 'range',
                        'min' => 10,
                        'max' => 100,
                        'step' => 10,
                        'default' => Value::DEFAULT_QUALITY,
                        'append' => '%',
                        'width' => 100,
                    ],
                    'mute' => [
                        'display' => 'Uden lyd',
                        'instructions' => 'Lyden fjernes, når videoen uploades.',
                        'type' => 'toggle',
                        'default' => false,
                        'width' => 50,
                    ],
                ],
            ],
        ];
    }

    public function preload(): array
    {
        $limits = Value::limits($this->config() ?? []);

        return [
            'uploadUrl' => cp_route('upload-video.store'),
            'chunkBytes' => Value::chunkBytes(),
            'maxMb' => $limits['maxMb'],
            'maxBytes' => $limits['maxBytes'],
            'maxToken' => Value::maxToken($limits['maxBytes'], (string) config('app.key')),
            'size' => $limits['size'],
            'quality' => $limits['quality'],
            'audio' => $limits['audio'],
            'posterUrl' => cp_route('upload-video.poster', ['id' => '__ID__']),
            'deleteUrl' => cp_route('upload-video.destroy', ['id' => '__ID__']),
        ];
    }

    public function preProcess($value)
    {
        return Value::normalize($value);
    }

    public function preProcessIndex($value): string
    {
        return Value::normalize($value)['filename'] ?? '';
    }

    public function process($value)
    {
        return Value::normalize($value);
    }

    public function augment($value)
    {
        $value = Value::normalize($value);

        if ($value === null) {
            return null;
        }

        return app(Processor::class)->describe($value);
    }
}
