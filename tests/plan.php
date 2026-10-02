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

exit($failed === 0 ? 0 : 1);
