// Multi-field label model. A label is either CLASSIC (a single text/image) or a
// TEMPLATE — a vertical stack of text fields. A label is a template only when it
// carries a non-empty `fields` array; everything else in the app falls back to
// the classic path, so classic labels keep their exact shape. Each field:
//   { id, value, size:'s'|'m'|'l', align:'left'|'center'|'right', bold }
// `value` is a template string that may contain {{tokens}} (see tokens.js).
import { newId } from './persistence.js';

// Relative band heights. One source of truth so the screen (flex-grow) and the
// ZPL dot-heights divide a label the same way.
export const SIZE_WEIGHT = { s: 1, m: 1.7, l: 2.8 };
export const SIZE_OPTIONS = [{ value: 's', label: 'S' }, { value: 'm', label: 'M' }, { value: 'l', label: 'L' }];
export const ALIGN_OPTIONS = [{ value: 'left', label: 'L' }, { value: 'center', label: 'C' }, { value: 'right', label: 'R' }];
export const DEFAULT_FIELD = { value: '', size: 'm', align: 'center', bold: true };

// Symbology values a barcode field may hold — kept in sync with the keys of
// SYMBOLOGY_META in src/lib/barcode.js (duplicated here so this pure model
// module never imports the barcode encoding libraries).
const BARCODE_SYMBOLOGIES = ['code128', 'ean13', 'upca', 'gs1-128', 'code39', 'qr'];

// Coerce one field to the canonical shape, tolerant of junk. Preserves id.
// Barcode keys (type/symbology/hri) are attached ONLY to barcode fields, so a
// plain text field stays {id,value,size,align,bold} — byte-identical to before.
export function normalizeField(f) {
    f = f || {};
    const out = {
        id: f.id || newId(),
        value: typeof f.value === 'string' ? f.value : '',
        size: f.size === 's' || f.size === 'l' ? f.size : 'm',
        align: f.align === 'left' || f.align === 'right' ? f.align : 'center',
        bold: f.bold !== false,
    };
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

// Inline style for a screen band: height weight + horizontal alignment + weight.
export function fieldStyle(f) {
    const justify = f.align === 'left' ? 'flex-start' : f.align === 'right' ? 'flex-end' : 'center';
    return `flex:${fieldWeight(f)} 1 0;justify-content:${justify};text-align:${f.align};font-weight:${f.bold ? 'bold' : 'normal'};`;
}

// Unified emptiness test (classic OR template). Pure, so zpl.js can import it
// without pulling in the reactive store.
export function labelIsEmpty(l) {
    if (!l) { return true; }
    if (l.image) { return false; }
    if (l.fields && l.fields.length) { return l.fields.every((f) => !f.value || !f.value.trim()); }
    return !l.text || !l.text.trim();
}
