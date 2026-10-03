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
export async function shrink(file, onProgress, options = {}) {
    const shortSide = options.height === 1080 ? 1080 : 720;
    const quality = typeof options.quality === 'number' && options.quality >= 0 && options.quality <= 1
        ? options.quality
        : 0.5;
    const input = new Input({
        formats: [MP4, QTFF, WEBM, OGG],
        source: new BlobSource(file),
    });

    try {
        const output = new Output({
            format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
            target: new BufferTarget(),
        });
        const trim = {};
        if (typeof options.start === 'number' && options.start > 0) {
            trim.start = options.start;
        }
        if (typeof options.end === 'number' && options.end > 0) {
            trim.end = options.end;
        }
        if (trim.start != null && trim.end != null && trim.start >= trim.end) {
            throw new Error('Slut skal ligge efter start.');
        }

        const conversion = await Conversion.init({
            input,
            output,
            trim: trim.start != null || trim.end != null ? trim : undefined,
            video: async (track) => {
                if (track.number > 1) {
                    return { discard: true };
                }

                return {
                    height: targetHeight(await track.getDisplayWidth(), await track.getDisplayHeight(), shortSide),
                    codec: 'avc',
                    quality: new Quality(quality),
                    hardwareAcceleration: 'prefer-hardware',
                };
            },
            audio: options.audio === false
                ? { discard: true }
                : async (track) => {
                    if (track.number > 1) {
                        return { discard: true };
                    }

                    return {
                        codec: 'aac',
                        quality: new Quality(quality),
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
