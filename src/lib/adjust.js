// How an image sits inside its label. An image always fills the whole label;
// these fields only control the crop within that frame, so they stay
// re-editable (never baked into the pixels). fit = show-whole vs crop-to-fill;
// posX/posY are object-position percentages driven by the Position grid and by
// drag-to-reposition; zoom is a scale() multiplier.
export const DEFAULT_ADJUST = {
    fit: 'contain',
    posX: 50,
    posY: 50,
    zoom: 1,
};

// The 3x3 Position grid, shared by the editor so alignment presets are defined
// in exactly one place.
export const ALIGN_CELLS = [
    { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 },
    { x: 0, y: 50 }, { x: 50, y: 50 }, { x: 100, y: 50 },
    { x: 0, y: 100 }, { x: 50, y: 100 }, { x: 100, y: 100 },
];

// Plain-language fit labels (no more overloaded "Fill").
export const FIT_OPTIONS = [
    { value: 'contain', label: 'Show whole image' },
    { value: 'cover', label: 'Crop to fill' },
];

// Scale the image within its label: below 1 shrinks it (smaller than the label,
// with padding), above 1 enlarges/crops it. 1 = fit to the label.
export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 4;

const clamp = (v, lo, hi, d) => {
    const n = parseFloat(v);
    return isNaN(n) ? d : Math.min(hi, Math.max(lo, n));
};

// Tolerant of legacy fields (layout/side/split from older saved files) — they
// are simply ignored, so v2 .json label files still load.
export function normalizeAdjust(a) {
    a = a || {};
    return {
        fit: a.fit === 'cover' ? 'cover' : 'contain',
        posX: clamp(a.posX, 0, 100, 50),
        posY: clamp(a.posY, 0, 100, 50),
        zoom: clamp(a.zoom, ZOOM_MIN, ZOOM_MAX, 1),
    };
}

// CSS custom properties the stylesheet reads for object-fit/position/scale.
export function adjustStyle(adjust) {
    const a = normalizeAdjust(adjust);
    return (
        `--fit:${a.fit};` +
        `--posx:${a.posX}%;` +
        `--posy:${a.posY}%;` +
        `--zoom:${a.zoom};`
    );
}
