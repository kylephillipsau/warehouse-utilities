// Barcode generation shared by the on-screen preview (SVG, see BarcodeView) and
// the ZPL print canvas (drawBarcodeToCanvas). We only encode with the libraries
// and draw the modules ourselves, so screen and print come from one source and
// the print path snaps every module to whole printer dots (crisp + scannable).
import JsBarcode from 'jsbarcode';
import qrcode from 'qrcode-generator';
import { parseGs1, gs1ForJsBarcode, gs1Hri, validateGs1, gtinCheckDigit } from './gs1.js';
import { encodeDataMatrix } from './vendor/datamatrix.js';

// GTIN/GLN/SSCC check digit lives in gs1.js (shared with the GS1-128 path);
// re-exported here so existing barcode importers keep their entry point.
export { gtinCheckDigit };

// Per-symbology metadata drives the UI (labels, hints) and the encoders. `kind`
// is the geometry family (1d bars vs 2d matrix); `lengths` (EAN/UPC) is the set
// of accepted digit counts (data-only, and data+check-digit).
export const SYMBOLOGY_META = {
    code128: { label: 'Code 128', kind: '1d' },
    ean13: { label: 'EAN-13', kind: '1d', digitsOnly: true, lengths: [12, 13] },
    upca: { label: 'UPC-A', kind: '1d', digitsOnly: true, lengths: [11, 12] },
    'gs1-128': { label: 'GS1-128', kind: '1d', gs1: true },
    code39: { label: 'Code 39', kind: '1d' },
    qr: { label: 'QR code', kind: '2d' },
    datamatrix: { label: 'Data Matrix', kind: '2d' },
};

export const SYMBOLOGY_OPTIONS = [
    { value: 'code128', label: 'Code 128' },
    { value: 'ean13', label: 'EAN-13' },
    { value: 'upca', label: 'UPC-A' },
    { value: 'gs1-128', label: 'GS1-128' },
    { value: 'code39', label: 'Code 39' },
    { value: 'qr', label: 'QR code' },
    { value: 'datamatrix', label: 'Data Matrix' },
];

export const QR_EC_OPTIONS = [
    { value: 'L', label: 'L' },
    { value: 'M', label: 'M' },
    { value: 'Q', label: 'Q' },
    { value: 'H', label: 'H' },
];

const JSBARCODE_FORMAT = { code128: 'CODE128', code39: 'CODE39' };
export const is1D = (symbology) => (SYMBOLOGY_META[symbology]?.kind || '1d') === '1d';
export const isBarcode = (f) => !!(f && f.type === 'barcode');

// Quiet zones (in modules) per spec: ≥10 for 1D, 4 for QR.
export const QUIET_1D = 10;
export const QUIET_QR = 4;

// Normalise EAN-13/UPC-A input to { data (12/11 digits, no check), full (with
// check digit) }, or null if it isn't the right count of digits. Both the
// encoder (screen) and the native-ZPL emitter route through this so they agree.
function gtinData(value, symbology) {
    const compact = String(value == null ? '' : value).replace(/\s/g, '');
    const meta = SYMBOLOGY_META[symbology];
    const dataLen = meta.lengths[0];
    if (!/^\d+$/.test(compact) || !meta.lengths.includes(compact.length)) { return null; }
    const data = compact.length === dataLen + 1 ? compact.slice(0, dataLen) : compact;
    return { data, full: data + String(gtinCheckDigit(data)) };
}

// Lightweight validation for UI hints (encodeBarcode is the source of truth).
export function validate(value, symbology) {
    const v = value == null ? '' : String(value);
    if (!v.trim()) { return { ok: false, error: 'Enter a value to encode.' }; }
    // Code 39 is uppercase-only; JsBarcode auto-uppercases, so we check the
    // uppercased value and only flag genuinely unsupported characters.
    if (symbology === 'code39' && /[^0-9A-Z\-. $/+%]/.test(v.toUpperCase())) {
        return { ok: false, error: 'Code 39 allows A–Z, 0–9 and - . $ / + % and space only.' };
    }
    if (symbology === 'ean13' || symbology === 'upca') {
        const meta = SYMBOLOGY_META[symbology];
        const compact = v.replace(/\s/g, '');
        if (!/^\d+$/.test(compact)) {
            return { ok: false, error: `${meta.label} is digits only.` };
        }
        if (!meta.lengths.includes(compact.length)) {
            return { ok: false, error: `${meta.label} needs ${meta.lengths[0]} digits (${meta.lengths[1]} with check digit).` };
        }
    }
    if (symbology === 'gs1-128') { return validateGs1(v); }
    if (symbology === 'datamatrix' && encodeDataMatrix(v) == null) {
        return { ok: false, error: 'Too much data for one Data Matrix symbol.' };
    }
    return { ok: true, error: null };
}

// Encode a value. Returns one of:
//   { kind:'1d', modules:'1010…', text }   — modules string, 1=bar 0=space
//   { kind:'2d', size, isDark(r,c) }        — square 2D module matrix (QR)
//   { error }                               — invalid / un-encodable data
// `opts.ecLevel` (QR only) sets error-correction 'L'|'M'|'Q'|'H' (default 'M').
export function encodeBarcode(value, symbology, { ecLevel } = {}) {
    const v = value == null ? '' : String(value);
    if (!v.trim()) { return { error: 'empty' }; }
    try {
        if (symbology === 'qr') {
            const ec = ['L', 'M', 'Q', 'H'].includes(ecLevel) ? ecLevel : 'M';
            const qr = qrcode(0, ec);        // version auto, error-correction ec
            qr.addData(v);
            qr.make();
            return { kind: '2d', size: qr.getModuleCount(), isDark: (r, c) => qr.isDark(r, c) };
        }
        if (symbology === 'datamatrix') {
            const dm = encodeDataMatrix(v);   // square, ECC 200
            return dm || { error: 'encode-failed' };
        }
        if (symbology === 'ean13' || symbology === 'upca') {
            const g = gtinData(v, symbology);
            if (!g) { return { error: 'bad-data' }; }
            const enc = {};
            JsBarcode(enc, g.full, { format: symbology === 'ean13' ? 'EAN13' : 'UPC', flat: true });
            const e = enc.encodings && enc.encodings[0];
            if (!e || !e.data) { return { error: 'encode-failed' }; }
            // HRI from the validated digits — flat mode's .text is guard-only.
            return { kind: '1d', modules: e.data, text: g.full };
        }
        if (symbology === 'gs1-128') {
            const segs = parseGs1(v);
            if (!segs.length) { return { error: 'no-ai' }; }
            const enc = {};
            JsBarcode(enc, gs1ForJsBarcode(segs), { format: 'CODE128' });
            const e = enc.encodings && enc.encodings[0];
            if (!e || !e.data) { return { error: 'encode-failed' }; }
            return { kind: '1d', modules: e.data, text: gs1Hri(segs) };
        }
        const fmt = JSBARCODE_FORMAT[symbology] || 'CODE128';
        const enc = {};
        JsBarcode(enc, v, { format: fmt });
        const e = enc.encodings && enc.encodings[0];
        if (!e || !e.data) { return { error: 'encode-failed' }; }
        return { kind: '1d', modules: e.data, text: e.text != null ? String(e.text) : v };
    } catch (err) {
        return { error: (err && err.message) || 'encode-failed' };
    }
}

// Draw an encoded barcode into (x,y,w,h) on a 2D canvas context at INTEGER module
// widths (so on the printer's dot grid each module is a whole number of dots →
// crisp and scannable). Draws bars/modules only; the caller draws any HRI text.
// Compute the design-space geometry of a barcode inside band (x,y,w,h): the
// integer module width (1D) / magnification (QR), the content top-left (sx,sy)
// after quiet zone + alignment, and its size (fw,fh). `scale` (0.1–1) narrows the
// barcode from "as wide as possible" (1). Shared by the ZPL emitter so screen and
// print size a barcode the same way; all values are printer dots.
export function barcodeLayout(enc, x, y, w, h, { align = 'center', scale = 1 } = {}) {
    const Wt = Math.max(1, w * Math.min(1, Math.max(0.1, scale)));
    if (enc.kind === '2d') {
        const n = enc.size;
        const mag = Math.max(1, Math.floor(Math.min(Wt, h) / (n + 2 * QUIET_QR)));
        const side = n * mag;
        const quiet = QUIET_QR * mag;
        const total = side + 2 * quiet;
        const sx = Math.round(x + alignOffset(align, w, total) + quiet);
        const sy = Math.round(y + Math.max(0, h - total) / 2 + quiet);
        return { kind: '2d', mag, sx, sy, fw: side, fh: side };
    }
    const N = enc.modules.length;
    const module = Math.max(1, Math.floor(Wt / (N + 2 * QUIET_1D)));
    const barsW = N * module;
    const quiet = QUIET_1D * module;
    const total = barsW + 2 * quiet;
    const sx = Math.round(x + alignOffset(align, w, total) + quiet);
    const sy = Math.round(y);
    return { kind: '1d', module, sx, sy, fw: barsW, fh: Math.round(h) };
}

// Field-data tail with ZPL hex-escaping for ^ ~ _ (the only chars that would be
// misread as commands). Returns e.g. "^FDABC^FS" or "^FH^FD_5eX^FS".
function fdTail(body) {
    if (/[\^~_]/.test(body)) {
        const esc = body.replace(/[\^~_]/g, (ch) => '_' + ch.charCodeAt(0).toString(16).padStart(2, '0'));
        return `^FH^FD${esc}^FS`;
    }
    return `^FD${body}^FS`;
}

// Emit ONE native ZPL barcode field. `data` is the resolved value; `layout` is
// from barcodeLayout (design coords). In landscape the whole design frame is
// rotated 90° CW on the printer, so we map the symbol's design top-left through
// P(dx,dy)=(pageW−dy,dx): a 1D field rotates via orientation R (its ^FO anchors
// the top-right); QR scans at any angle so we leave it upright (orientation N) at
// the mapped top-left. Printer dots throughout.
export function barcodeZplField(enc, data, layout, symbology, { landscape = false, pageW = 0, ecLevel } = {}) {
    const L = layout;
    if (enc.kind === '2d') {
        // 2D symbols scan at any angle, so we keep them upright (orient N) at the
        // landscape-mapped top-left rather than rotating the field.
        const fox = landscape ? (pageW - L.sy - L.fh) : L.sx;
        const foy = landscape ? L.sx : L.sy;
        if (symbology === 'datamatrix') {
            // ^BX: module dot size = mag, quality 200 (ECC 200); columns/rows
            // auto (printer sizes the symbol from the data).
            return `^FO${fox},${foy}^BXN,${L.mag},200${fdTail(data)}`;
        }
        // ^BQ error-correction: the model param and the ^FD prefix must agree.
        const ec = ['L', 'M', 'Q', 'H'].includes(ecLevel) ? ecLevel : 'M';
        return `^FO${fox},${foy}^BQN,2,${L.mag},${ec}${fdTail(ec + 'A,' + data)}`;
    }
    const fox = landscape ? (pageW - L.sy) : L.sx;
    const foy = landscape ? L.sx : L.sy;
    const o = landscape ? 'R' : 'N';
    if (symbology === 'ean13' || symbology === 'upca') {
        // The printer computes and appends the check digit, so feed the data
        // digits only (12 for EAN-13, 11 for UPC-A). HRI drawn in our own font.
        const g = gtinData(data, symbology);
        const fd = g ? g.data : String(data).replace(/\s/g, '');
        const cmd = symbology === 'ean13' ? `^BE${o},${L.fh},N,N` : `^BU${o},${L.fh},N,N,N`;
        return `^FO${fox},${foy}^BY${L.module}${cmd}${fdTail(fd)}`;
    }
    if (symbology === 'gs1-128') {
        // Native ^BC mode D: hand the printer the (AI)value string; it strips the
        // parentheses, inserts the leading + separator FNC1s, and adds the check
        // digit. HRI is drawn in our own font.
        const fd = gs1Hri(parseGs1(data));
        return `^FO${fox},${foy}^BY${L.module}^BC${o},${L.fh},N,N,N,D${fdTail(fd)}`;
    }
    if (symbology === 'code39') {
        return `^FO${fox},${foy}^BY${L.module},3^B3${o},N,${L.fh},N,N${fdTail(data)}`;
    }
    return `^FO${fox},${foy}^BY${L.module}^BC${o},${L.fh},N,N,N${fdTail(data)}`;
}

function alignOffset(align, avail, content) {
    const slack = Math.max(0, avail - content);
    if (align === 'left') { return 0; }
    if (align === 'right') { return slack; }
    return slack / 2;
}
