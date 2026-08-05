// The printable "page" is the physical label/media the printer feeds. Following
// the thermal-printer convention, every size is Width × Length where WIDTH is
// across the print head and LENGTH is the feed direction. The @page is emitted
// at the exact media size; the media divides into N equal labels down its
// length, so cut guides always run across the feed.
//
// There are TWO independent rotations here, and conflating them is what made
// 4×3 stock print "too tall". Keep them apart:
//
//   MEDIA ORIENTATION (page.orientation) is a real page dimension: it swaps the
//   media's width and length, and @page and ^PW/^LL follow. It is only ever a
//   choice for SHEET stock (A4/Letter on a normal printer), where feeding a
//   sheet the long way round is ordinary. A label printer's head width is fixed
//   hardware, so thermal stock has exactly ONE way to feed and callers pin this
//   to portrait for thermal output — see the invariant in App.svelte.
//
//   ARTWORK ROTATION (store.rotation, 0 or 90) is a property of the ARTWORK,
//   exactly as ^FW/field rotation is in ZPL. 0 lays the content out on the label
//   as-is; 90 lays it out on a box with the label's width and height swapped and
//   rotates it into place. The media, the @page and ^PW/^LL are identical either
//   way, which is what keeps output exact on stock that cannot be re-fed.
//
// So: rotating the MEDIA changes the page. Rotating the ARTWORK never does.
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

export const DEFAULT_PAGE = { preset: 'zebra-4x6', width: '', height: '', unit: 'mm', orientation: 'portrait' };
export const DEFAULT_DIVISIONS = 5;
export const MAX_DIVISIONS = 50;

// Artwork rotation in degrees — the ^FW analogue. Only the two right angles a
// label design actually uses; anything else coerces to 0 rather than throwing,
// since this value comes back from persisted state and shared files.
export const DEFAULT_ROTATION = 0;
export const clampRotation = (v) => (parseInt(v, 10) === 90 ? 90 : 0);

// Media orientation is a real choice only for sheet stock; whether the current
// output is thermal is output.isThermalMethod's job, not this module's.
export const clampMediaOrientation = (v) => (v === 'landscape' ? 'landscape' : 'portrait');

// Max printable width across a 4-inch/203-dpi thermal head (~832 dots). Media
// wider than this is clipped by the printer — there is no way to fit it, since
// the head width is fixed hardware. Only meaningful for thermal output (an A4
// sheet is legitimately 210 mm), so callers gate the warning on the method.
export const MAX_PRINT_WIDTH_MM = 104;

// True when the media is too wide for a 4-inch thermal head. Length is NOT
// checked: the feed direction is unbounded in the same way ^LL is.
export function exceedsPrintWidth(page) {
    return resolvePage(page).width > MAX_PRINT_WIDTH_MM;
}

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

// Print quantity: how many times the whole job repeats (Zebra ^PQ). 1 = a
// single pass; capped so a stray keystroke can't queue thousands of labels.
export const MAX_COPIES = 999;
export function clampCopies(n) {
    const v = parseInt(n, 10);
    if (isNaN(v)) { return 1; }
    return Math.min(MAX_COPIES, Math.max(1, v));
}

// Margin (page edge) / gap (between labels), in mm, clamped to a sane range.
export const MAX_SPACING = 50;
export function clampSpacing(v) {
    const n = parseFloat(v);
    if (isNaN(n) || n < 0) { return 0; }
    return round(Math.min(MAX_SPACING, n));
}

// The physical media size in mm — width (across head) × length (feed). This is
// the ONE size used for @page and for ^PW/^LL, so output is 1:1.
//
// MEDIA orientation is applied here, because it genuinely is a page dimension:
// a landscape A4 sheet is 297 × 210, and @page must say so. ARTWORK rotation is
// deliberately absent — it never changes the media (see resolveContent). For
// thermal output the caller pins orientation to portrait, so a fixed-width head
// can never be handed a page wider than itself.
export function resolvePage(page) {
    let native;
    if (page.preset === 'custom') {
        native = { width: clampMm(page.width, page.unit, 101.6), height: clampMm(page.height, page.unit, 152.4) };
    } else {
        const p = MEDIA_PRESETS[page.preset] || MEDIA_PRESETS.a4;
        native = { width: p.width, height: p.height };
    }
    if (page.orientation === 'landscape') { return { width: native.height, height: native.width }; }
    return native;
}

// The CONTENT box inside one label — the surface the artwork is actually laid
// out on. At rotation 0 it is the label itself; at 90 it swaps the label's width
// and height, and the result is rotated back into the label (by CSS on screen,
// by a canvas transform in zpl.buildZpl). The LABEL and the MEDIA never change
// shape, so this is a pure artwork rotation — the ZPL analogue of ^FW, not a
// different page size. Contrast resolvePage, which is where media orientation
// legitimately does change the page.
export function resolveContent(page, divisions, margin = 0, gap = 0, rotation = 0) {
    const l = resolveLabel(page, divisions, margin, gap);
    return clampRotation(rotation) === 90 ? { width: l.height, height: l.width } : l;
}

// Build a store.page spec from a device media query (browserPrint.queryMedia).
// The printer senses LENGTH reliably (→ page height) but never senses WIDTH, so
// width comes back as a suggestion: use it if present, else keep the current
// page width. Always a custom spec so the width stays visible in the UI's
// width input for the user to confirm/correct. Returns null if no usable length.
export function pageFromMedia(media, currentPage) {
    if (!media || (media.lengthMm == null && media.widthMm == null)) { return null; }
    const cur = resolvePage(currentPage || DEFAULT_PAGE);
    return {
        preset: 'custom',
        width: media.widthMm != null ? media.widthMm : cur.width,
        height: media.lengthMm != null ? media.lengthMm : cur.height,
        unit: 'mm',
        // Sensed from a label printer, so by definition the native feed: the
        // numbers already describe the stock the way it loads.
        orientation: 'portrait',
    };
}

// A label fills the media width inside the page margin; its length is the
// remaining length (after margins + the gaps between labels) divided by N.
// Orientation is deliberately not a parameter: labels always stack down the
// FEED, so the cut guides between them are always cross-feed cuts.
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

// Push resolved dimensions into root CSS custom properties. The media is shown
// at its true resolved size (media orientation included, since that IS the page)
// — artwork rotation changes only --content-w/h, and the stylesheet rotates that
// box into the label (see .label-rotate), then rotates the whole SHEET back by
// the inverse so the artwork is edited upright (see .page-frame).
// `data-rotation` on <html> is what both of those CSS rules key off.
export function applySize(page, divisions, margin = 0, gap = 0, rotation = 0) {
    const p = resolvePage(page);
    const label = resolveLabel(page, divisions, margin, gap);
    const content = resolveContent(page, divisions, margin, gap, rotation);
    const n = clampDivisions(divisions);
    const root = document.documentElement.style;
    root.setProperty('--page-w', p.width + 'mm');
    root.setProperty('--page-h', p.height + 'mm');
    root.setProperty('--label-w', label.width + 'mm');
    root.setProperty('--label-h', label.height + 'mm');
    root.setProperty('--content-w', content.width + 'mm');
    root.setProperty('--content-h', content.height + 'mm');
    root.setProperty('--tile-cols', '1');
    root.setProperty('--tile-rows', String(n));
    root.setProperty('--page-margin', clampSpacing(margin) + 'mm');
    root.setProperty('--gap', clampSpacing(gap) + 'mm');
    document.documentElement.dataset.rotation = String(clampRotation(rotation));
}

// Where a pointer falls in a list of label elements. Labels always stack down
// the feed, but on screen at rotation 90 the sheet is turned -90° so artwork can
// be edited upright (see .page-frame in app.css), and that turns the stack into
// a left-to-right row. Insertion therefore has to measure along the axis the
// labels VISUALLY run on — reading clientY there picks a target from a
// coordinate that no longer varies between labels. Returns an INSERT position
// in 0..elements.length; callers moving an existing item clamp to length - 1.
export function insertionIndex(elements, event) {
    const acrossX = document.documentElement.dataset.rotation === '90';
    const pos = acrossX ? event.clientX : event.clientY;
    for (let i = 0; i < elements.length; i++) {
        const r = elements[i].getBoundingClientRect();
        const mid = acrossX ? r.left + r.width / 2 : r.top + r.height / 2;
        if (pos < mid) { return i; }
    }
    return elements.length;
}
