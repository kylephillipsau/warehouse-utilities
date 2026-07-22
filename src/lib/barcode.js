// Barcode generation shared by the on-screen preview (SVG, see BarcodeView) and
// the ZPL print canvas (drawBarcodeToCanvas). We only encode with the libraries
// and draw the modules ourselves, so screen and print come from one source and
// the print path snaps every module to whole printer dots (crisp + scannable).
import JsBarcode from 'jsbarcode';
import qrcode from 'qrcode-generator';

export const SYMBOLOGY_OPTIONS = [
    { value: 'code128', label: 'Code 128' },
    { value: 'qr', label: 'QR code' },
    { value: 'code39', label: 'Code 39' },
];

const JSBARCODE_FORMAT = { code128: 'CODE128', code39: 'CODE39' };
export const is1D = (symbology) => symbology === 'code128' || symbology === 'code39';
export const isBarcode = (f) => !!(f && f.type === 'barcode');

// Quiet zones (in modules) per spec: ≥10 for 1D, 4 for QR.
export const QUIET_1D = 10;
export const QUIET_QR = 4;

// Lightweight validation for UI hints (encodeBarcode is the source of truth).
export function validate(value, symbology) {
    const v = value == null ? '' : String(value);
    if (!v.trim()) { return { ok: false, error: 'Enter a value to encode.' }; }
    // Code 39 is uppercase-only; JsBarcode auto-uppercases, so we check the
    // uppercased value and only flag genuinely unsupported characters.
    if (symbology === 'code39' && /[^0-9A-Z\-. $/+%]/.test(v.toUpperCase())) {
        return { ok: false, error: 'Code 39 allows A–Z, 0–9 and - . $ / + % and space only.' };
    }
    return { ok: true, error: null };
}

// Encode a value. Returns one of:
//   { kind:'1d', modules:'1010…', text }   — modules string, 1=bar 0=space
//   { kind:'2d', size, isDark(r,c) }        — square QR module matrix
//   { error }                               — invalid / un-encodable data
export function encodeBarcode(value, symbology) {
    const v = value == null ? '' : String(value);
    if (!v.trim()) { return { error: 'empty' }; }
    try {
        if (symbology === 'qr') {
            const qr = qrcode(0, 'M');       // version auto, error-correction M
            qr.addData(v);
            qr.make();
            return { kind: '2d', size: qr.getModuleCount(), isDark: (r, c) => qr.isDark(r, c) };
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
export function barcodeZplField(enc, data, layout, symbology, { landscape = false, pageW = 0 } = {}) {
    const L = layout;
    if (enc.kind === '2d') {
        const fox = landscape ? (pageW - L.sy - L.fh) : L.sx;
        const foy = landscape ? L.sx : L.sy;
        return `^FO${fox},${foy}^BQN,2,${L.mag},M${fdTail('MA,' + data)}`;
    }
    const fox = landscape ? (pageW - L.sy) : L.sx;
    const foy = landscape ? L.sx : L.sy;
    const o = landscape ? 'R' : 'N';
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
