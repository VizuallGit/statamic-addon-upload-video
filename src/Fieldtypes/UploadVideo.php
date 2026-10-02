<?php

namespace Vizuall\UploadVideo\Fieldtypes;

use Statamic\Fields\Fieldtype;
use Vizuall\UploadVideo\Encode\Ffmpeg;
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
            'deleteUrl' => cp_route('upload-video.destroy', ['id' => '__ID__']),
            'previewUrl' => cp_route('upload-video.preview', ['id' => '__ID__']),
            'ffmpeg' => Ffmpeg::binary() !== null,
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
        $value = Value::normalize($value);

        if ($value !== null && ! app()->runningInConsole() && ! $this->isLivePreview()) {
            app(Processor::class)->queue($value);
        }

        return $value;
    }

    public function augment($value)
    {
        $value = Value::normalize($value);

        if ($value === null) {
            return null;
        }

        return app(Processor::class)->describe($value, $this->shouldEncodeNow());
    }

    private function shouldEncodeNow(): bool
    {
        if ($this->isLivePreview()) {
            return false;
        }

        if (app()->runningInConsole()) {
            return true;
        }

        $prefix = trim((string) config('statamic.cp.route'), '/');

        return $prefix === '' || ! request()->is($prefix, $prefix.'/*');
    }

    private function isLivePreview(): bool
    {
        return request()->hasMacro('isLivePreview') && request()->isLivePreview();
    }
}
