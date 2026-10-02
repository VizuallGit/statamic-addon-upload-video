<?php

namespace Vizuall\UploadVideo\Encode;

final class Plan
{
    public const SIZES = [480, 720, 1080];

    public const QUALITIES = [
        'high' => 20,
        'standard' => 23,
        'lower' => 30,
    ];

    public static function normalizeSize(mixed $size): ?int
    {
        if ($size === null || $size === '' || $size === 'original' || $size === 0 || $size === '0') {
            return null;
        }

        $size = (int) $size;

        return in_array($size, self::SIZES, true) ? $size : 720;
    }

    public static function normalizeQuality(mixed $quality): string
    {
        $quality = (string) $quality;

        return array_key_exists($quality, self::QUALITIES) ? $quality : 'standard';
    }

    /**
     * @return list<string>
     */
    public static function videoArguments(string $input, string $output, ?int $height, string $quality, bool $audio, string $extension): array
    {
        $extension = strtolower($extension);
        $canCopy = in_array($extension, ['mp4', 'm4v'], true);

        if ($height === null && $quality === 'standard' && $audio && $canCopy) {
            return ['-y', '-i', $input, '-c', 'copy', '-movflags', '+faststart', $output];
        }

        if ($height === null && $quality === 'standard' && ! $audio && $canCopy) {
            return ['-y', '-i', $input, '-c:v', 'copy', '-an', '-movflags', '+faststart', $output];
        }

        $args = ['-y', '-i', $input];

        if ($height !== null) {
            $args[] = '-vf';
            $args[] = 'scale=-2:'.$height.':force_original_aspect_ratio=decrease';
        }

        array_push(
            $args,
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', (string) self::QUALITIES[$quality],
            '-pix_fmt', 'yuv420p',
        );

        if ($audio) {
            array_push($args, '-c:a', 'aac', '-b:a', '128k');
        } else {
            $args[] = '-an';
        }

        array_push($args, '-movflags', '+faststart', $output);

        return $args;
    }

    /**
     * @return list<string>
     */
    public static function posterArguments(string $input, string $output, float $seconds): array
    {
        return ['-y', '-i', $input, '-ss', self::seconds($seconds), '-frames:v', '1', '-q:v', '3', $output];
    }

    public static function seconds(float $seconds): string
    {
        return number_format(max(0, $seconds), 2, '.', '');
    }
}
