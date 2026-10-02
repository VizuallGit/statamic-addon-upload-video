<?php

namespace Vizuall\UploadVideo\Fieldtypes;

use Illuminate\Support\Collection;
use Statamic\Contracts\Assets\AssetFolder as AssetFolderContract;
use Statamic\Contracts\Entries\Entry;
use Statamic\Facades\Asset;
use Statamic\Facades\AssetContainer;
use Statamic\Facades\User;
use Statamic\Fields\Fieldtype;
use Statamic\Support\Str;
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
                'display' => __('Input Behavior'),
                'fields' => [
                    'container' => [
                        'display' => __('Container'),
                        'instructions' => __('statamic::fieldtypes.assets.config.container'),
                        'type' => 'asset_container',
                        'max_items' => 1,
                        'mode' => 'select',
                        'required' => true,
                        'default' => AssetContainer::all()->count() == 1 ? AssetContainer::all()->first()->handle() : null,
                        'force_in_config' => true,
                        'width' => 50,
                    ],
                    'allow_uploads' => [
                        'display' => __('Allow Uploads'),
                        'instructions' => __('statamic::fieldtypes.assets.config.allow_uploads'),
                        'type' => 'toggle',
                        'default' => true,
                        'width' => 50,
                    ],
                    'folder' => [
                        'display' => __('Folder'),
                        'instructions' => __('statamic::fieldtypes.assets.config.folder'),
                        'type' => 'asset_folder',
                        'max_items' => 1,
                        'mode' => 'select',
                        'if' => [
                            'container' => 'not empty',
                        ],
                        'width' => 50,
                    ],
                    'dynamic' => [
                        'display' => __('Dynamic Folder'),
                        'instructions' => __('statamic::fieldtypes.assets.config.dynamic'),
                        'type' => 'select',
                        'clearable' => true,
                        'options' => [
                            'id' => __('ID'),
                            'slug' => __('Slug'),
                            'author' => __('Author'),
                        ],
                        'validate' => 'in:id,slug,author',
                        'if' => [
                            'container' => 'not empty',
                        ],
                        'width' => 50,
                    ],
                    'restrict' => [
                        'display' => __('Restrict to Folder'),
                        'instructions' => __('statamic::fieldtypes.assets.config.restrict'),
                        'type' => 'toggle',
                        'if' => [
                            'container' => 'not empty',
                            'dynamic' => 'not true',
                        ],
                        'width' => 50,
                    ],
                ],
            ],
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
            [
                'display' => __('Boundaries & Limits'),
                'fields' => [
                    'max_files' => [
                        'display' => __('Max Files'),
                        'instructions' => __('statamic::fieldtypes.assets.config.max_files'),
                        'type' => 'integer',
                        'default' => 1,
                        'min' => 1,
                        'width' => 50,
                    ],
                    'min_files' => [
                        'display' => __('Min Files'),
                        'instructions' => __('statamic::fieldtypes.assets.config.min_files'),
                        'type' => 'integer',
                        'min' => 1,
                        'width' => 50,
                    ],
                ],
            ],
        ];
    }

    public function preload(): array
    {
        $limits = Value::limits($this->config() ?? []);
        $container = $this->assetContainer();
        $user = User::current();
        $segment = $this->dynamicSegment();
        $dynamic = (string) $this->config('dynamic');
        $pending = in_array($dynamic, ['id', 'slug', 'author'], true) && $segment === '';
        $folder = Value::folder($this->config('folder'));

        if ($segment !== '') {
            $folder = trim($folder.'/'.$segment, '/');
        }

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
            'posterAssetUrl' => cp_route('upload-video.poster-asset'),
            'deleteUrl' => cp_route('upload-video.destroy', ['id' => '__ID__']),
            'assetsUrl' => cp_url('assets-fieldtype'),
            'allowUploads' => $this->allowsUploads(),
            'folder' => $folder === '' ? '/' : $folder,
            'dynamicPending' => $pending,
            'restrict' => $pending || $dynamic !== '' || filter_var($this->config('restrict'), FILTER_VALIDATE_BOOLEAN),
            'maxFiles' => $this->maxFiles(),
            'container' => $container === null ? null : [
                'id' => $container->id(),
                'title' => $container->title(),
                'edit_url' => $container->editUrl(),
                'delete_url' => $container->deleteUrl(),
                'blueprint_url' => cp_route('blueprints.asset-containers.edit', $container->handle()),
                'can_view' => $user !== null && $user->can('view', $container),
                'can_upload' => false,
                'can_edit' => $user !== null && $user->can('edit', $container),
                'can_delete' => false,
                'can_create_folders' => $user !== null && $user->can('create', [AssetFolderContract::class, $container]),
                'sort_field' => $container->sortField(),
                'sort_direction' => $container->sortDirection(),
            ],
        ];
    }

    public function preProcess($value)
    {
        return $this->present(Value::items($value));
    }

    public function preProcessIndex($value): string
    {
        return implode(', ', array_map(static fn (array $item): string => $item['filename'], Value::items($value)));
    }

    public function process($value)
    {
        $items = array_slice(Value::items($value), 0, $this->maxFiles());
        $items = array_map(static function (array $item): array {
            unset($item['url'], $item['filesize']);

            return $item;
        }, $items);

        return $this->maxFiles() === 1 ? ($items[0] ?? null) : array_values($items);
    }

    public function augment($value)
    {
        $described = [];

        foreach (Value::items($value) as $item) {
            $one = app(Processor::class)->describe($item);

            if ($one !== null) {
                $described[] = $one;
            }
        }

        return $this->maxFiles() === 1 ? ($described[0] ?? null) : $described;
    }

    private function maxFiles(): int
    {
        $max = (int) $this->config('max_files');

        return $max >= 1 ? $max : 1;
    }

    private function allowsUploads(): bool
    {
        $value = $this->config('allow_uploads');

        if ($value === null || $value === '') {
            return true;
        }

        return filter_var($value, FILTER_VALIDATE_BOOLEAN);
    }

    private function assetContainer(): mixed
    {
        $handle = Value::containerHandle($this->config('container'));

        if ($handle !== null) {
            return AssetContainer::find($handle);
        }

        $all = AssetContainer::all();

        return $all->count() === 1 ? $all->first() : null;
    }

    private function dynamicSegment(): string
    {
        $key = (string) $this->config('dynamic');

        if (! in_array($key, ['id', 'slug', 'author'], true)) {
            return '';
        }

        $parent = $this->field->parent();

        if (! $parent instanceof Entry) {
            return '';
        }

        $value = $parent->get($key);

        if ($value instanceof Collection) {
            $value = $value->first();
        }

        if (is_object($value) && method_exists($value, 'id')) {
            $value = $value->id();
        }

        if (is_array($value)) {
            $value = $value[0] ?? '';
        }

        $value = trim((string) $value);

        if ($value === '' || str_contains($value, '/') || str_contains($value, '..')) {
            return '';
        }

        return $value;
    }

    /**
     * @param  list<array<string, mixed>>  $items
     * @return array<string, mixed>|list<array<string, mixed>>|null
     */
    private function present(array $items): array|null
    {
        $items = array_map(function (array $item): array {
            if (is_string($item['asset'] ?? null)) {
                $asset = Asset::find($item['asset']);

                if ($asset !== null) {
                    $item['url'] = $asset->url();
                    $item['filesize'] = Str::fileSizeForHumans($asset->size());
                    $item['filename'] = $item['filename'] !== '' ? $item['filename'] : $asset->basename();
                }
            } elseif (is_string($item['id'] ?? null)) {
                $item['url'] = '/assets/upload-video/'.$item['id'].'.'.$item['extension'];
            }

            return $item;
        }, $items);

        if ($this->maxFiles() === 1) {
            return $items[0] ?? null;
        }

        return array_values($items);
    }
}
