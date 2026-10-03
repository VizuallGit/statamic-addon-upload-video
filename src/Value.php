<?php

namespace Vizuall\UploadVideo;

use Vizuall\UploadVideo\Encode\Plan;

final class Value
{
    public const EXTENSIONS = ['mp4', 'm4v', 'webm', 'mov', 'ogv'];

    public const DEFAULT_MB = 30;

    public const DEFAULT_QUALITY = 70;

    public static function idOk(string $id): bool
    {
        return (bool) preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $id);
    }

    public static function clampPoster(float $seconds, ?float $duration): float
    {
        $seconds = max(0, $seconds);

        if ($duration !== null && $duration > 0) {
            $seconds = min($seconds, max(0, $duration - 0.05));
        }

        return round($seconds, 2);
    }

    public static function normalize(mixed $value): ?array
    {
        if (is_object($value) && method_exists($value, 'toArray')) {
            $value = $value->toArray();
        }

        if (is_string($value) && str_starts_with(trim($value), '{')) {
            $decoded = json_decode($value, true);
            $value = is_array($decoded) ? $decoded : null;
        }

        if (! is_array($value)) {
            return null;
        }

        $asset = (string) ($value['asset'] ?? '');
        $id = (string) ($value['id'] ?? '');
        $hasAsset = self::assetOk($asset);
        $hasId = self::idOk($id);

        if (! $hasAsset && ! $hasId) {
            return null;
        }

        $extension = strtolower((string) ($value['extension'] ?? ''));

        if ($extension === '' && $hasAsset) {
            $extension = strtolower(pathinfo($asset, PATHINFO_EXTENSION));
        }

        if (! in_array($extension, self::EXTENSIONS, true)) {
            return null;
        }

        $duration = isset($value['duration']) && $value['duration'] !== ''
            ? (float) $value['duration']
            : null;

        $filename = (string) ($value['filename'] ?? '');

        if ($filename === '' && $hasAsset) {
            $filename = basename(substr($asset, strpos($asset, '::') + 2));
        }

        return [
            'id' => $hasId ? $id : null,
            'asset' => $hasAsset ? $asset : null,
            'filename' => self::filename($filename !== '' ? $filename : ('video.'.$extension)),
            'extension' => $extension,
            'url' => self::safeUrl($value['url'] ?? null),
            'filesize' => self::filesizeLabel($value['filesize'] ?? null),
            'poster_at' => self::clampPoster((float) ($value['poster_at'] ?? 1), $duration),
            'size' => Plan::normalizeSize($value['size'] ?? 720),
            'quality' => Plan::normalizeQuality($value['quality'] ?? 'standard'),
            'audio' => self::audio($value['audio'] ?? true),
            'duration' => $duration,
        ];
    }

    /**
     * One saved video, or a list of them when the field allows more than one.
     *
     * @return list<array<string, mixed>>
     */
    public static function items(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $rows = array_is_list($value) ? $value : [$value];
        $items = [];

        foreach ($rows as $row) {
            $item = self::normalize($row);

            if ($item !== null) {
                $items[] = $item;
            }
        }

        return $items;
    }

    public static function assetOk(string $id): bool
    {
        if (! preg_match('/^[A-Za-z0-9_-]+::(.+)$/', $id, $matches)) {
            return false;
        }

        $path = $matches[1];

        if ($path === '' || str_contains($path, '..') || str_starts_with($path, '/')) {
            return false;
        }

        return in_array(strtolower(pathinfo($path, PATHINFO_EXTENSION)), self::EXTENSIONS, true);
    }

    public static function folder(mixed $folder): string
    {
        if (is_array($folder)) {
            $folder = $folder[0] ?? '';
        }

        $folder = trim(str_replace('\\', '/', (string) $folder), '/');

        if ($folder === '' || str_contains($folder, '..')) {
            return '';
        }

        return $folder;
    }

    public static function containerHandle(mixed $handle): ?string
    {
        $handle = is_string($handle) ? $handle : '';

        return preg_match('/^[A-Za-z0-9_-]+$/', $handle) ? $handle : null;
    }

    private static function safeUrl(mixed $value): ?string
    {
        if (! is_string($value) || ! str_starts_with($value, '/') || str_contains($value, '..')) {
            return null;
        }

        if (preg_match('/[\s<>"\']/', $value)) {
            return null;
        }

        return mb_substr($value, 0, 500);
    }

    private static function filesizeLabel(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $value = trim($value);

        if ($value === '' || strlen($value) > 20 || ! preg_match('/^[0-9.,]+\s*[KMGT]?B$/i', $value)) {
            return null;
        }

        return $value;
    }

    public static function audio(mixed $audio): bool
    {
        if (is_bool($audio)) {
            return $audio;
        }

        return filter_var($audio, FILTER_VALIDATE_BOOLEAN);
    }

    public static function filename(string $name): string
    {
        $name = basename(str_replace('\\', '/', $name));
        $name = preg_replace('/[^\w.\- ]+/u', '', $name) ?: 'video';

        return mb_substr($name, 0, 180);
    }

    /**
     * Each browser request stays under PHP's post limit. 0 from ini means unlimited.
     */
    public static function iniToBytes(string $raw): int
    {
        $raw = trim($raw);

        if ($raw === '' || $raw === '0' || $raw === '-1') {
            return 0;
        }

        $number = (float) $raw;
        $unit = strtolower(substr($raw, -1));
        $bytes = match ($unit) {
            'g' => (int) ($number * 1024 * 1024 * 1024),
            'm' => (int) ($number * 1024 * 1024),
            'k' => (int) ($number * 1024),
            default => (int) $number,
        };

        return max(0, $bytes);
    }

    /**
     * The blueprint field is the source. Missing or out-of-range values use the default.
     *
     * @param  array<string, mixed>  $config
     * @return array{maxMb: int, maxBytes: int}
     */
    public static function limits(array $config): array
    {
        $mb = (int) ($config['max_mb'] ?? self::DEFAULT_MB);

        if ($mb < 1 || $mb > 1024) {
            $mb = self::DEFAULT_MB;
        }

        return [
            'maxMb' => $mb,
            'maxBytes' => $mb * 1024 * 1024,
        ];
    }

    /**
     * Percent from the range field, snapped to tens between 10 and 100.
     * Mediabunny takes 0 to 1, where 1 is the highest quality.
     */
    public static function quality(mixed $value): float
    {
        $percent = (int) $value;

        if ($percent < 10 || $percent > 100) {
            $percent = self::DEFAULT_QUALITY;
        }

        $percent = (int) (round($percent / 10) * 10);
        $percent = min(100, max(10, $percent));

        return $percent / 100;
    }

    public static function maxToken(int $bytes, string $key): string
    {
        return hash_hmac('sha256', (string) $bytes, $key);
    }

    public static function applyToken(string $assetId, bool $replace, string $key): string
    {
        return hash_hmac('sha256', $assetId.'|'.($replace ? '1' : '0'), $key);
    }

    public static function acceptedApply(mixed $assetId, mixed $replace, mixed $token, string $key): bool
    {
        $assetId = is_string($assetId) ? $assetId : '';
        $given = is_string($token) ? $token : '';

        if ($assetId === '' || $given === '' || ! self::assetOk($assetId)) {
            return false;
        }

        $flag = filter_var($replace, FILTER_VALIDATE_BOOLEAN);

        return hash_equals(self::applyToken($assetId, $flag, $key), $given);
    }

    /**
     * Accepts only a max that this fieldtype issued. A changed number does not match the token.
     */
    public static function acceptedMax(mixed $bytes, mixed $token, string $key): ?int
    {
        $bytes = (int) $bytes;

        if ($bytes < 1024 * 1024 || $bytes > 1024 * 1024 * 1024 || $bytes % (1024 * 1024) !== 0) {
            return null;
        }

        $given = is_string($token) ? $token : '';

        if ($given === '' || ! hash_equals(self::maxToken($bytes, $key), $given)) {
            return null;
        }

        return $bytes;
    }

    public static function chunkBytes(): int
    {
        $limits = array_filter([
            self::iniToBytes((string) ini_get('upload_max_filesize')),
            self::iniToBytes((string) ini_get('post_max_size')),
        ], static fn (int $bytes): bool => $bytes > 0);

        $limit = $limits === [] ? (8 * 1024 * 1024) : min($limits);
        $safe = max(1, (int) floor($limit * 0.7));

        return min(1024 * 1024, $safe);
    }

    public static function videoSignatureOk(string $head, string $extension): bool
    {
        return match ($extension) {
            'mp4', 'm4v', 'mov' => strlen($head) >= 8 && substr($head, 4, 4) === 'ftyp',
            'webm' => str_starts_with($head, "\x1A\x45\xDF\xA3"),
            'ogv' => str_starts_with($head, 'OggS'),
            default => false,
        };
    }
}
