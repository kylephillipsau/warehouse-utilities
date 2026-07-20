// Label size presets. "standard" leaves the stylesheet defaults untouched
// (100 x 22 mm, widening to 143 mm in landscape) so the built-in size never
// drifts; every other size fixes the width for both orientations. Ported from
// the original applyLabelSize.
export const LABEL_SIZE_PRESETS = {
    address: { width: 89, height: 28 },
    'large-address': { width: 89, height: 36 },
    shipping: { width: 100, height: 150 },
};

export function clampMm(value, fallback) {
    const n = parseFloat(value);
    return isNaN(n) ? fallback : Math.min(500, Math.max(10, n));
}

// Push the chosen size into the root CSS custom properties the label box reads.
export function applySize(size) {
    let dims = LABEL_SIZE_PRESETS[size.preset] || null;
    if (size.preset === 'custom') {
        dims = { width: clampMm(size.width, 100), height: clampMm(size.height, 22) };
    }
    const root = document.documentElement.style;
    if (dims) {
        root.setProperty('--label-w', dims.width + 'mm');
        root.setProperty('--label-h', dims.height + 'mm');
        // Landscape rotates a preset/custom label 90 degrees; only the built-in
        // standard size keeps its legacy widen-to-143mm behaviour
        root.setProperty('--label-w-landscape', dims.height + 'mm');
        root.setProperty('--label-h-landscape', dims.width + 'mm');
    } else {
        root.removeProperty('--label-w');
        root.removeProperty('--label-h');
        root.removeProperty('--label-w-landscape');
        root.removeProperty('--label-h-landscape');
    }
}

export function isCustom(size) {
    return size.preset === 'custom';
}
