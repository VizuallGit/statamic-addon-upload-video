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

    public function preload(): array
    {
        return [
            'uploadUrl' => cp_route('upload-video.store'),
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
