// The printable "page" is the physical label/media the printer feeds. A label
// fills the page width, and the page is divided into N equal labels down its
// height (the "5 in a single label, cut apart" model). So the label size is
// derived from the page + the number of divisions — responsive to the page.
// All dimensions resolve to millimetres; custom sizes may be entered in inches.

const MM_PER_IN = 25.4;

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

export const DEFAULT_PAGE = { preset: 'zebra-4x6', width: '', height: '', unit: 'mm' };
export const DEFAULT_DIVISIONS = 5;
export const MAX_DIVISIONS = 50;

const round = (n) => Math.round(n * 1000) / 1000;

function clampMm(value, unit, fallback) {
    let n = parseFloat(value);
    if (isNaN(n)) { return fallback; }
    if (unit === 'in') { n *= MM_PER_IN; }
    return round(Math.min(1000, Math.max(5, n)));
}

export const isCustom = (spec) => spec.preset === 'custom';

export function clampDivisions(n) {
    const v = parseInt(n, 10);
    if (isNaN(v)) { return 1; }
    return Math.min(MAX_DIVISIONS, Math.max(1, v));
}

// Margin (page edge) / gap (between labels), in mm, clamped to a sane range.
export const MAX_SPACING = 50;
export function clampSpacing(v) {
    const n = parseFloat(v);
    if (isNaN(n) || n < 0) { return 0; }
    return round(Math.min(MAX_SPACING, n));
}

export function resolvePage(page) {
    if (page.preset === 'custom') {
        return { width: clampMm(page.width, page.unit, 101.6), height: clampMm(page.height, page.unit, 152.4) };
    }
    const p = MEDIA_PRESETS[page.preset] || MEDIA_PRESETS.a4;
    return { width: p.width, height: p.height };
}

// Landscape swaps the page's width and height.
export function orientedPage(page, orientation) {
    const p = resolvePage(page);
    return orientation === 'landscape' ? { width: p.height, height: p.width } : p;
}

// A label fills the (oriented) page width inside the page margin; its height is
// the remaining height (after margins + the gaps between labels) divided by N.
export function resolveLabel(page, divisions, orientation, margin = 0, gap = 0) {
    const p = orientedPage(page, orientation);
    const n = clampDivisions(divisions);
    const m = clampSpacing(margin);
    const g = clampSpacing(gap);
    const availW = Math.max(1, p.width - 2 * m);
    const availH = Math.max(1, p.height - 2 * m - (n - 1) * g);
    return { width: round(availW), height: round(Math.max(1, availH / n)) };
}

// The page divides into N stacked labels (one column).
export function tiling(divisions) {
    const n = clampDivisions(divisions);
    return { cols: 1, rows: n, perPage: n };
}

// Push resolved dimensions into root CSS custom properties.
export function applySize(page, divisions, orientation, margin = 0, gap = 0) {
    const p = orientedPage(page, orientation);
    const label = resolveLabel(page, divisions, orientation, margin, gap);
    const n = clampDivisions(divisions);
    const root = document.documentElement.style;
    root.setProperty('--page-w', p.width + 'mm');
    root.setProperty('--page-h', p.height + 'mm');
    root.setProperty('--label-w', label.width + 'mm');
    root.setProperty('--label-h', label.height + 'mm');
    root.setProperty('--tile-cols', '1');
    root.setProperty('--tile-rows', String(n));
    root.setProperty('--page-margin', clampSpacing(margin) + 'mm');
    root.setProperty('--gap', clampSpacing(gap) + 'mm');
}
