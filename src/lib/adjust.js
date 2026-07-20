// How an image sits in its label. Kept as plain metadata (not baked into the
// pixels) so it stays re-editable. posX/posY are object-position percentages
// driven by the alignment buttons and by drag-to-pan; zoom is a scale()
// multiplier; split is the beside-mode image-column width percentage, driven by
// the inline resize handle.
export const DEFAULT_ADJUST = {
    layout: 'beside',
    side: 'left',
    fit: 'contain',
    posX: 50,
    posY: 50,
    zoom: 1,
    split: 45,
};

const clamp = (v, lo, hi, d) => {
    const n = parseFloat(v);
    return isNaN(n) ? d : Math.min(hi, Math.max(lo, n));
};

export function normalizeAdjust(a) {
    a = a || {};
    return {
        layout: a.layout === 'fill' ? 'fill' : 'beside',
        side: a.side === 'right' ? 'right' : 'left',
        fit: a.fit === 'cover' ? 'cover' : 'contain',
        posX: clamp(a.posX, 0, 100, 50),
        posY: clamp(a.posY, 0, 100, 50),
        zoom: clamp(a.zoom, 1, 4, 1),
        split: clamp(a.split, 15, 85, 45),
    };
}

// Inline CSS custom properties for a label/preview element, derived from adjust.
// The stylesheet reads these for object-fit/position/scale and the beside split.
export function adjustStyle(adjust) {
    const a = normalizeAdjust(adjust);
    return (
        `--fit:${a.fit};` +
        `--posx:${a.posX}%;` +
        `--posy:${a.posY}%;` +
        `--zoom:${a.zoom};` +
        `--split:${a.split}%;`
    );
}
