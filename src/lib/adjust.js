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

// Option metadata shared by the Adjust dialog and the inline controls, so the
// available choices are defined in exactly one place.
export const ALIGN_CELLS = [
    { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 },
    { x: 0, y: 50 }, { x: 50, y: 50 }, { x: 100, y: 50 },
    { x: 0, y: 100 }, { x: 50, y: 100 }, { x: 100, y: 100 },
];
export const LAYOUT_OPTIONS = [
    { value: 'beside', label: 'Beside text' },
    { value: 'fill', label: 'Fill label' },
];
export const FIT_OPTIONS = [
    { value: 'contain', label: 'Fit' },
    { value: 'cover', label: 'Fill' },
];
export const SIDE_OPTIONS = [
    { value: 'left', label: 'Left' },
    { value: 'right', label: 'Right' },
];

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 4;

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
        zoom: clamp(a.zoom, ZOOM_MIN, ZOOM_MAX, 1),
        split: clamp(a.split, 15, 85, 45),
    };
}

// "fill" only applies when there is an image to fill with; otherwise a label
// falls back to the beside layout so its text area still fills the box.
export function effectiveLayout(adjust, hasImage) {
    return hasImage && adjust.layout === 'fill' ? 'fill' : 'beside';
}

export function isSideRight(adjust, hasImage) {
    return hasImage && effectiveLayout(adjust, hasImage) === 'beside' && adjust.side === 'right';
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
