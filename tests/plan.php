<?php

require __DIR__.'/../src/Encode/Plan.php';
require __DIR__.'/../src/Value.php';

use Vizuall\UploadVideo\Encode\Plan;
use Vizuall\UploadVideo\Value;

$failed = 0;

function check(bool $ok, string $message): void
{
    global $failed;
    if ($ok) {
        echo "ok  {$message}\n";
        return;
    }
    $failed++;
    echo "FAIL {$message}\n";
}

check(Plan::normalizeSize('original') === null, 'original size');
check(Plan::normalizeSize(720) === 720, '720 size');
check(Plan::normalizeSize(700) === 720, 'unknown size falls back to 720');
check(Plan::normalizeQuality('lower') === 'lower', 'lower quality');
check(Plan::normalizeQuality('nope') === 'standard', 'unknown quality');

check(Value::posterAdjustments(['quality' => '30', 'format' => 'webp']) === ['quality' => 30, 'format' => 'webp'], 'poster quality and webp');
check(Value::posterAdjustments(['30', 'webp']) === ['quality' => 30, 'format' => 'webp'], 'poster positional quality and webp');
check(Value::posterAdjustments(['30']) === ['quality' => 30], 'poster positional quality only');
check(Value::posterAdjustments(['format' => 'jpeg']) === ['format' => 'jpg'], 'poster jpeg becomes jpg');
check(Value::posterAdjustments(['quality' => '0', 'format' => 'bmp', 'width' => '1280']) === [], 'poster ignores size and invalid values');
check(Value::posterAdjustments([]) === [], 'poster without adjustments');

$copy = Plan::videoArguments('/in.mp4', '/out.mp4', null, 'standard', true, 'mp4');
check(in_array('-c', $copy, true) && in_array('copy', $copy, true), 'mp4 original is copied');
check(! in_array('-an', $copy, true), 'copy keeps audio');

$strip = Plan::videoArguments('/in.mp4', '/out.mp4', null, 'standard', false, 'mp4');
check(in_array('-an', $strip, true) && in_array('copy', $strip, true), 'audio can be removed without reencoding');

$small = Plan::videoArguments('/in.mov', '/out.mp4', 720, 'lower', false, 'mov');
check(in_array('scale=-2:720:force_original_aspect_ratio=decrease', $small, true), '720p scales down and does not enlarge');
check(in_array('30', $small, true), 'lower quality uses crf 30');
check(in_array('-an', $small, true), '720p without audio');
check(in_array('libx264', $small, true), 'non-mp4 is reencoded');

$poster = Plan::posterArguments('/in.mp4', '/out.jpg', 10);
check(in_array('10.00', $poster, true) && in_array('-frames:v', $poster, true), 'poster is one frame at the given second');

check(Value::clampPoster(100, 10) === 9.95, 'poster cannot sit past the end');
check(Value::clampPoster(-2, 10) === 0.0, 'poster cannot be negative');
check(Value::clampPoster(1, null) === 1.0, 'poster stays at 1 second when length is unknown');
check(Value::idOk('not-an-id') === false, 'ids are uuids');

$id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
$normalized = Value::normalize([
    'id' => $id,
    'filename' => '../secret.mp4',
    'extension' => 'mp4',
    'poster_at' => 100,
    'duration' => 8,
    'size' => 1080,
    'quality' => 'high',
    'audio' => 'false',
]);
check($normalized['filename'] === 'secret.mp4', 'filename cannot leave the folder');
check($normalized['poster_at'] === 7.95, 'stored poster is clamped to the video');
check($normalized['audio'] === false, 'audio false is kept');
check($normalized['size'] === 1080, '1080 is kept');
check(Value::normalize(['id' => $id, 'extension' => 'jpg']) === null, 'images are rejected');
check(Value::assetOk('assets::films/show.mp4'), 'an asset id is a container path');
check(Value::assetOk('assets::../secret.mp4') === false, 'an asset path cannot climb');
check(Value::folder('../secret') === '', 'a folder cannot climb');
check(Value::folder(['videos/hero']) === 'videos/hero', 'a chosen folder is kept');
$picked = Value::normalize(['asset' => 'assets::films/show.mp4', 'filename' => 'show.mp4']);
check($picked !== null && $picked['asset'] === 'assets::films/show.mp4' && $picked['extension'] === 'mp4' && $picked['id'] === null, 'a library video does not need a uuid');
check(count(Value::items([$picked, ['id' => $id, 'extension' => 'jpg']])) === 1, 'a list keeps only videos');
check(count(Value::items($picked)) === 1, 'one video is still one video');

check(Value::iniToBytes('20M') === 20 * 1024 * 1024, '20M is 20 mebibytes');
check(Value::iniToBytes('0') === 0, 'unlimited ini is 0');
$post = Value::iniToBytes((string) ini_get('post_max_size'));
$chunk = Value::chunkBytes();
check($chunk <= 1024 * 1024, 'a chunk is at most 1 MiB');
check($post === 0 || $chunk < $post, 'a chunk stays under post_max_size');
check(Value::videoSignatureOk("\x00\x00\x00\x18ftypisom", 'mp4'), 'mp4 signature');
check(Value::videoSignatureOk("PK\x03\x04xxxxftyp", 'mp4') === false, 'ftyp must be the first box');
check(Value::videoSignatureOk("\x1A\x45\xDF\xA3rest", 'webm'), 'webm signature');
check(Value::videoSignatureOk('OggSxxxx', 'ogv'), 'ogg signature');

if (! function_exists('storage_path')) {
    function storage_path(string $path = ''): string
    {
        return sys_get_temp_dir().'/uv-chunk-test/storage/'.ltrim($path, '/');
    }
}

if (! function_exists('public_path')) {
    function public_path(string $path = ''): string
    {
        return sys_get_temp_dir().'/uv-chunk-test/public/'.ltrim($path, '/');
    }
}

require __DIR__.'/../src/Encode/Processor.php';
require __DIR__.'/../src/Chunks.php';

use Vizuall\UploadVideo\Chunks;

check(Value::limits([])['maxMb'] === 30, 'the field defaults to 30 MB');
check(Value::limits(['max_mb' => 20])['maxMb'] === 20, 'the field max is the number that was set');
check(Value::limits(['max_mb' => 20])['maxBytes'] === 20 * 1024 * 1024, '20 MB is 20 mebibytes');
check(Value::quality(70) === 0.7, 'quality defaults to 70 percent');
check(Value::quality(10) === 0.1, '10 percent quality');
check(Value::quality(100) === 1.0, '100 percent quality');
check(Value::quality(73) === 0.7, 'quality snaps to the nearest ten');
check(Value::quality(3) === 0.7, 'quality below 10 falls back to 70');
check(Value::limits(['max_mb' => 0])['maxMb'] === 30, 'an empty max falls back to 30');
$token = Value::maxToken(20 * 1024 * 1024, 'test-key');
check(Value::acceptedMax(20 * 1024 * 1024, $token, 'test-key') === 20 * 1024 * 1024, 'a matching token keeps 20 MB');
check(Value::acceptedMax(10 * 1024 * 1024, $token, 'test-key') === null, 'a changed max is rejected');
check(Chunks::tooBigMessage(20 * 1024 * 1024) === 'Videoen må højst være 20 MB.', 'the message uses the field max');

$movie = "\x00\x00\x00\x18ftypisom"."\x00\x00\x02\x00mdat";
$parts = Chunks::directory($id);
mkdir($parts, 0755, true);
file_put_contents($parts.'/0', substr($movie, 0, 8));
file_put_contents($parts.'/1', substr($movie, 8));
Chunks::finish($id, 2, 'mp4', 30 * 1024 * 1024);
$joined = public_path('assets/upload-video/'.$id.'.mp4');
check(is_file($joined) && file_get_contents($joined) === $movie, 'chunks join into one mp4');
check(is_dir($parts) === false, 'part files are removed after join');

$parts = Chunks::directory($id);
mkdir($parts, 0755, true);
file_put_contents($parts.'/0', "PK\x03\x04not-a-video");
$rejected = false;
try {
    Chunks::finish($id, 1, 'mp4', 30 * 1024 * 1024);
} catch (RuntimeException) {
    $rejected = true;
}
check($rejected, 'a joined file without a video signature is rejected');
check(is_file($joined) === false, 'rejected upload leaves no video file');

exit($failed === 0 ? 0 : 1);
