// Multi-field label model. A label is either CLASSIC (a single text/image) or a
// TEMPLATE, a GRID of text fields. A label is a template only when it carries a
// non-empty `fields` array; everything else in the app falls back to the classic
// path, so classic labels keep their exact shape. Each field:
//   { id, value, size:'s'|'m'|'l', width:'s'|'m'|'l',
//     align:'left'|'center'|'right', bold, inline? }
// `value` is a template string that may contain {{tokens}} (see tokens.js).
//
// The grid stays a FLAT array. Fields run top to bottom, and a field marked
// `inline` joins the row the field before it started instead of opening its own.
// That is what lets a row hold several cells without changing the stored shape:
// a template written before grids existed has no `inline` anywhere, so every
// field opens its own full-width row and renders exactly as it always did.
//
//   size    weights the ROW's height; a row takes the largest of its cells
//   width   weights the CELL's share of its row's width
//
// toRows() is the single definition of that grouping, used by the screen and by
// the ZPL canvas so both divide a label identically.
import { newId } from './persistence.js';

// Relative band heights. One source of truth so the screen (flex-grow) and the
// ZPL dot-heights divide a label the same way.
export const SIZE_WEIGHT = { s: 1, m: 1.7, l: 2.8 };
export const SIZE_OPTIONS = [{ value: 's', label: 'S' }, { value: 'm', label: 'M' }, { value: 'l', label: 'L' }];
export const ALIGN_OPTIONS = [{ value: 'left', label: 'L' }, { value: 'center', label: 'C' }, { value: 'right', label: 'R' }];
export const DEFAULT_FIELD = { value: '', size: 'm', width: 'm', align: 'center', bold: true };

// Symbology values a barcode field may hold — kept in sync with the keys of
// SYMBOLOGY_META in src/lib/barcode.js (duplicated here so this pure model
// module never imports the barcode encoding libraries).
const BARCODE_SYMBOLOGIES = ['code128', 'ean13', 'upca', 'gs1-128', 'code39', 'qr', 'datamatrix'];

// Coerce one field to the canonical shape, tolerant of junk. Preserves id.
// Barcode keys (type/symbology/hri) are attached ONLY to barcode fields, so a
// plain text field stays {id,value,size,align,bold} — byte-identical to before.
export function normalizeField(f) {
    f = f || {};
    const out = {
        id: f.id || newId(),
        value: typeof f.value === 'string' ? f.value : '',
        size: f.size === 's' || f.size === 'l' ? f.size : 'm',
        width: f.width === 's' || f.width === 'l' ? f.width : 'm',
        align: f.align === 'left' || f.align === 'right' ? f.align : 'center',
        bold: f.bold !== false,
    };
    // Attached only when set, so a field that opens its own row stays exactly
    // the shape it was before grids existed.
    if (f.inline) { out.inline = true; }
    if (f.type === 'barcode') {
        out.type = 'barcode';
        // Kept as a local list so this pure module stays free of the barcode
        // libraries; mirror src/lib/barcode.js SYMBOLOGY_META keys.
        out.symbology = BARCODE_SYMBOLOGIES.includes(f.symbology) ? f.symbology : 'code128';
        out.hri = f.hri !== false;
        // barcode width as a fraction of the band (1 = as wide as possible)
        const s = parseFloat(f.scale);
        out.scale = isNaN(s) ? 1 : Math.min(1, Math.max(0.1, s));
        // QR error-correction level (attached only to QR fields).
        if (out.symbology === 'qr') {
            out.ecLevel = ['L', 'M', 'Q', 'H'].includes(f.ecLevel) ? f.ecLevel : 'M';
        }
    }
    return out;
}

export function makeField(partial = {}) {
    return normalizeField({ ...DEFAULT_FIELD, ...partial, id: newId() });
}

// Normalize an array of fields. `freshIds` mints new ids (for a new label/preset
// instance so two labels never share a field id).
export function normalizeFields(arr, { freshIds = false } = {}) {
    if (!Array.isArray(arr)) { return []; }
    return arr
        .filter((f) => f && typeof f === 'object')
        .map((f) => normalizeField(freshIds ? { ...f, id: undefined } : f));
}

// Clone fields for a fresh label instance (fresh ids); undefined when empty so
// callers can pass it straight to makeLabel without attaching an empty array.
export function cloneFields(arr) {
    return Array.isArray(arr) && arr.length ? normalizeFields(arr, { freshIds: true }) : undefined;
}

export const fieldWeight = (f) => SIZE_WEIGHT[f.size] || SIZE_WEIGHT.m;
export const cellWeight = (f) => SIZE_WEIGHT[f.width] || SIZE_WEIGHT.m;

// Group a flat field list into rows. A field opens a new row unless it is
// marked inline. The first field always opens one whatever it claims, since
// there is no row for it to join, so a stray flag can't produce an empty row.
// Returns [{ cells, weight }] where weight is the row's height share: the
// LARGEST of its cells' size weights, so an L cell gives its whole row the
// height an L band used to get on its own.
export function toRows(fields) {
    const rows = [];
    (fields || []).forEach((f) => {
        if (rows.length === 0 || !f.inline) { rows.push([f]); }
        else { rows[rows.length - 1].push(f); }
    });
    return rows.map((cells) => ({ cells, weight: Math.max(...cells.map(fieldWeight)) }));
}

// A row's height share of the label.
export const rowStyle = (row) => `flex:${row.weight} 1 0;`;

// A cell's width share of its row, plus the text presentation. Both renderers
// read the same weights, so the screen and the printed dot grid agree.
export function cellStyle(f) {
    const justify = f.align === 'left' ? 'flex-start' : f.align === 'right' ? 'flex-end' : 'center';
    return `flex:${cellWeight(f)} 1 0;justify-content:${justify};text-align:${f.align};font-weight:${f.bold ? 'bold' : 'normal'};`;
}

// Unified emptiness test (classic OR template). Pure, so zpl.js can import it
// without pulling in the reactive store.
export function labelIsEmpty(l) {
    if (!l) { return true; }
    if (l.image) { return false; }
    if (l.fields && l.fields.length) { return l.fields.every((f) => !f.value || !f.value.trim()); }
    return !l.text || !l.text.trim();
}
