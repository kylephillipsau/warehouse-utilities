// Two sizes drive printing:
//   page  = the physical label/media the printer feeds (becomes the @page size)
//   label = each individual label design (a "segment" tiled onto the page)
// The page is filled with a grid of segments, cut apart after printing. All
// dimensions resolve to millimetres; a custom size may be entered in inches.

const MM_PER_IN = 25.4;

// Media / page presets — real stock sizes, grouped. Dimensions in mm.
export const MEDIA_PRESETS = {
    'zebra-4x6': { group: 'Thermal label', label: '4 × 6 in (102 × 152 mm)', width: 101.6, height: 152.4 },
    'zebra-4x3': { group: 'Thermal label', label: '4 × 3 in (102 × 76 mm)', width: 101.6, height: 76.2 },
    'zebra-4x2': { group: 'Thermal label', label: '4 × 2 in (102 × 51 mm)', width: 101.6, height: 50.8 },
    'zebra-3x2': { group: 'Thermal label', label: '3 × 2 in (76 × 51 mm)', width: 76.2, height: 50.8 },
    'zebra-2x1': { group: 'Thermal label', label: '2 × 1 in (51 × 25 mm)', width: 50.8, height: 25.4 },
    'zebra-1.25x1': { group: 'Thermal label', label: '1.25 × 1 in (32 × 25 mm)', width: 31.75, height: 25.4 },
    'a4': { group: 'Sheet', label: 'A4 (210 × 297 mm)', width: 210, height: 297 },
    'letter': { group: 'Sheet', label: 'Letter (216 × 279 mm)', width: 215.9, height: 279.4 },
};

// Label / segment presets. Dimensions in mm.
export const LABEL_PRESETS = {
    standard: { label: 'Standard (100 × 22 mm)', width: 100, height: 22 },
    address: { label: 'Address (89 × 28 mm)', width: 89, height: 28 },
    'large-address': { label: 'Large address (89 × 36 mm)', width: 89, height: 36 },
    shipping: { label: 'Shipping (100 × 150 mm)', width: 100, height: 150 },
};

export const DEFAULT_PAGE = { preset: 'a4', width: '', height: '', unit: 'mm' };
export const DEFAULT_LABEL = { preset: 'standard', width: '', height: '', unit: 'mm' };

function clampMm(value, unit, fallback) {
    let n = parseFloat(value);
    if (isNaN(n)) { return fallback; }
    if (unit === 'in') { n *= MM_PER_IN; }
    n = Math.min(1000, Math.max(5, n));
    return Math.round(n * 1000) / 1000; // trim float noise (e.g. 3in -> 76.2mm)
}

export const isCustom = (spec) => spec.preset === 'custom';

// Resolve a page spec to concrete mm dimensions.
export function resolvePage(page) {
    if (page.preset === 'custom') {
        return { width: clampMm(page.width, page.unit, 101.6), height: clampMm(page.height, page.unit, 152.4) };
    }
    const p = MEDIA_PRESETS[page.preset] || MEDIA_PRESETS.a4;
    return { width: p.width, height: p.height };
}

export function resolveLabel(label) {
    if (label.preset === 'custom') {
        return { width: clampMm(label.width, label.unit, 100), height: clampMm(label.height, label.unit, 22) };
    }
    const l = LABEL_PRESETS[label.preset] || LABEL_PRESETS.standard;
    return { width: l.width, height: l.height };
}

// Landscape swaps the page's width and height.
export function orientedPage(page, orientation) {
    const p = resolvePage(page);
    return orientation === 'landscape' ? { width: p.height, height: p.width } : p;
}

// How many segments tile onto one page, and the grid shape.
export function tiling(pageDims, labelDims) {
    const cols = Math.max(1, Math.floor((pageDims.width + 0.01) / labelDims.width));
    const rows = Math.max(1, Math.floor((pageDims.height + 0.01) / labelDims.height));
    return { cols, rows, perPage: cols * rows };
}

// Push the resolved dimensions into root CSS custom properties.
export function applySize(page, label, orientation) {
    const pageDims = orientedPage(page, orientation);
    const labelDims = resolveLabel(label);
    const { cols, rows } = tiling(pageDims, labelDims);
    const root = document.documentElement.style;
    root.setProperty('--page-w', pageDims.width + 'mm');
    root.setProperty('--page-h', pageDims.height + 'mm');
    root.setProperty('--label-w', labelDims.width + 'mm');
    root.setProperty('--label-h', labelDims.height + 'mm');
    root.setProperty('--tile-cols', String(cols));
    root.setProperty('--tile-rows', String(rows));
}
