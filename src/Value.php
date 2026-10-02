<?php

namespace Vizuall\UploadVideo;

use Vizuall\UploadVideo\Encode\Plan;

final class Value
{
    public const EXTENSIONS = ['mp4', 'm4v', 'webm', 'mov', 'ogv'];

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

        $id = (string) ($value['id'] ?? '');
        $extension = strtolower((string) ($value['extension'] ?? ''));

        if (! self::idOk($id) || ! in_array($extension, self::EXTENSIONS, true)) {
            return null;
        }

        $duration = isset($value['duration']) && $value['duration'] !== ''
            ? (float) $value['duration']
            : null;

        return [
            'id' => $id,
            'filename' => self::filename((string) ($value['filename'] ?? ('video.'.$extension))),
            'extension' => $extension,
            'poster_at' => self::clampPoster((float) ($value['poster_at'] ?? 1), $duration),
            'size' => Plan::normalizeSize($value['size'] ?? 720),
            'quality' => Plan::normalizeQuality($value['quality'] ?? 'standard'),
            'audio' => self::audio($value['audio'] ?? true),
            'duration' => $duration,
        ];
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
