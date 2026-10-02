import {
    Input,
    Output,
    Conversion,
    Mp4OutputFormat,
    BufferTarget,
    BlobSource,
    MP4,
    QTFF,
    WEBM,
    OGG,
    Quality,
} from 'mediabunny';
import { targetHeight } from './target-height.mjs';

/**
 * Makes a smaller H.264 MP4 in the browser. The PHP server only stores the result.
 */
export async function shrink(file, onProgress) {
    const input = new Input({
        formats: [MP4, QTFF, WEBM, OGG],
        source: new BlobSource(file),
    });

    try {
        const output = new Output({
            format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
            target: new BufferTarget(),
        });
        const conversion = await Conversion.init({
            input,
            output,
            video: async (track) => {
                if (track.number > 1) {
                    return { discard: true };
                }

                return {
                    height: targetHeight(await track.getDisplayWidth(), await track.getDisplayHeight()),
                    codec: 'avc',
                    quality: new Quality('low'),
                    hardwareAcceleration: 'prefer-hardware',
                };
            },
            audio: async (track) => {
                if (track.number > 1) {
                    return { discard: true };
                }

                return {
                    codec: 'aac',
                    quality: new Quality('low'),
                };
            },
        });

        if (!conversion.isValid) {
            throw new Error('Browseren kan ikke gøre videoen mindre. Brug Chrome eller Safari.');
        }

        conversion.onProgress = (progress) => {
            if (typeof onProgress === 'function') {
                onProgress(progress);
            }
        };

        await conversion.execute();

        const buffer = output.target.buffer;

        if (!buffer || buffer.byteLength < 1) {
            throw new Error('Videoen kunne ikke gøres mindre.');
        }

        const base = String(file.name || 'video').replace(/\.[^.]+$/, '') || 'video';

        return new File([buffer], base + '.mp4', { type: 'video/mp4' });
    } finally {
        input.dispose();
    }
}
