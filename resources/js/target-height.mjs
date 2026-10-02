function even(value) {
    const rounded = Math.round(value);
    const next = rounded - (rounded % 2);
    return next >= 2 ? next : 2;
}

/**
 * Height to pass to the encoder so the short side is at most 720.
 * A smaller video stays at its own size.
 */
export function targetHeight(displayWidth, displayHeight) {
    const width = Math.round(Number(displayWidth));
    const height = Math.round(Number(displayHeight));

    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2) {
        return 720;
    }

    if (Math.min(width, height) <= 720) {
        return even(height);
    }

    if (height <= width) {
        return 720;
    }

    return even((720 * height) / width);
}
