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
}
