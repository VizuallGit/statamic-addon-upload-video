function even(value) {
    const rounded = Math.round(value);
    const next = rounded - (rounded % 2);
    return next >= 2 ? next : 2;
}

/**
 * Height to pass to the encoder so the short side is at most the chosen size.
 * A smaller video stays at its own size.
 */
export function targetHeight(displayWidth, displayHeight, shortSide = 720) {
    const cap = shortSide === 1080 ? 1080 : 720;
    const width = Math.round(Number(displayWidth));
    const height = Math.round(Number(displayHeight));

    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2) {
        return cap;
    }

    if (Math.min(width, height) <= cap) {
        return even(height);
    }

    if (height <= width) {
        return cap;
    }

    return even((cap * height) / width);
}
