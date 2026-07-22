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
// Returns { ok } / { ok:false } so the caller can skip the HRI on failure.
export function drawBarcodeToCanvas(ctx, enc, x, y, w, h, { align = 'center' } = {}) {
    if (!enc || enc.error) { return { ok: false }; }
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    if (enc.kind === '2d') {
        const n = enc.size;
        const units = n + 2 * QUIET_QR;
        const m = Math.max(1, Math.floor(Math.min(w, h) / units));
        const gridPx = n * m;
        const quietPx = QUIET_QR * m;
        const ox = Math.round(x + alignOffset(align, w, gridPx + 2 * quietPx) + quietPx);
        const oy = Math.round(y + (h - (gridPx + 2 * quietPx)) / 2 + quietPx);
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                if (enc.isDark(r, c)) { ctx.fillRect(ox + c * m, oy + r * m, m, m); }
            }
        }
    } else {
        const mods = enc.modules;
        const N = mods.length;
        const units = N + 2 * QUIET_1D;
        const m = Math.max(1, Math.floor(w / units));
        const barsW = N * m;
        const quietPx = QUIET_1D * m;
        const startX = Math.round(x + alignOffset(align, w, barsW + 2 * quietPx) + quietPx);
        const top = Math.round(y);
        const barH = Math.round(h);
        for (let i = 0; i < N; i++) {
            if (mods[i] === '1') { ctx.fillRect(startX + i * m, top, m, barH); }
        }
    }
    ctx.restore();
    return { ok: true };
}

function alignOffset(align, avail, content) {
    const slack = Math.max(0, avail - content);
    if (align === 'left') { return 0; }
    if (align === 'right') { return slack; }
    return slack / 2;
}
