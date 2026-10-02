import { targetHeight } from '../resources/js/target-height.mjs';

let failed = 0;

function check(ok, message) {
    if (ok) {
        console.log('ok  ' + message);
        return;
    }
    failed += 1;
    console.log('FAIL ' + message);
}

check(targetHeight(1920, 1080) === 720, 'landscape 1080p becomes 720 high');
check(targetHeight(1080, 1920) === 1280, 'portrait keeps a 720 short side');
check(targetHeight(1280, 720) === 720, '720p stays 720p');
check(targetHeight(640, 360) === 360, 'smaller than 720 is not enlarged');
check(targetHeight(720, 1280) === 1280, 'portrait 720 stays');
check(targetHeight(2000, 2000) === 720, 'square caps the short side');
check(targetHeight(100, 100) === 100, 'small square stays even');
check(targetHeight(0, 0) === 720, 'missing size falls back to 720');

process.exit(failed === 0 ? 0 : 1);
