// The printable "page" is the physical label/media the printer feeds. Following
// the thermal-printer convention (and CSS @page), every size is Width × Height
// where WIDTH is across the print head and HEIGHT is the feed/length direction.
// A label printer's head width is fixed, so media has ONE native orientation —
// we never swap width/height (swapping is what made 4×3 stock print "too tall",
// and Chrome auto-rotates any page wider than tall). The @page is emitted at the
// exact media size; the media divides into N equal labels down its height.
// All dimensions resolve to millimetres; custom sizes may be entered in inches.

const MM_PER_IN = 25.4;

// Width × Height = across-head × feed. Values are the real stock dimensions.
export const MEDIA_PRESETS = {
    'zebra-4x6': { group: 'Thermal label', label: '4 × 6 in (102 × 152 mm)', width: 101.6, height: 152.4 },
    'zebra-4x3': { group: 'Thermal label', label: '4 × 3 in (102 × 76 mm)', width: 101.6, height: 76.2 },
    'zebra-104x76': { group: 'Thermal label', label: '104 × 76 mm (4-in stock)', width: 104, height: 76.2 },
    'zebra-4x2': { group: 'Thermal label', label: '4 × 2 in (102 × 51 mm)', width: 101.6, height: 50.8 },
    'zebra-3x2': { group: 'Thermal label', label: '3 × 2 in (76 × 51 mm)', width: 76.2, height: 50.8 },
    'zebra-2x1': { group: 'Thermal label', label: '2 × 1 in (51 × 25 mm)', width: 50.8, height: 25.4 },
    'zebra-1.25x1': { group: 'Thermal label', label: '1.25 × 1 in (32 × 25 mm)', width: 31.75, height: 25.4 },
    'metric-100x150': { group: 'Thermal label', label: '100 × 150 mm', width: 100, height: 150 },
    'a4': { group: 'Sheet', label: 'A4 (210 × 297 mm)', width: 210, height: 297 },
    'letter': { group: 'Sheet', label: 'Letter (216 × 279 mm)', width: 215.9, height: 279.4 },
};

export const DEFAULT_PAGE = { preset: 'zebra-4x6', width: '', height: '', unit: 'mm' };
export const DEFAULT_DIVISIONS = 5;
export const MAX_DIVISIONS = 50;

// Max printable width across a 4-inch/203-dpi thermal head (~832 dots). Wider
// designs get clipped by the printer, so the UI can warn past this.
export const MAX_PRINT_WIDTH_MM = 104;

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

// The physical media size in mm — width (across head) × height (feed). This is
// exactly what the @page rule emits, so it must match the printer's stock.
export function resolvePage(page) {
    if (page.preset === 'custom') {
        return { width: clampMm(page.width, page.unit, 101.6), height: clampMm(page.height, page.unit, 152.4) };
    }
    const p = MEDIA_PRESETS[page.preset] || MEDIA_PRESETS.a4;
    return { width: p.width, height: p.height };
}

// A label fills the page width inside the page margin; its height is the
// remaining height (after margins + the gaps between labels) divided by N.
export function resolveLabel(page, divisions, margin = 0, gap = 0) {
    const p = resolvePage(page);
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
export function applySize(page, divisions, margin = 0, gap = 0) {
    const p = resolvePage(page);
    const label = resolveLabel(page, divisions, margin, gap);
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
