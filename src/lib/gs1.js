// GS1-128 (formerly UCC/EAN-128): a Code 128 symbol carrying GS1 Application
// Identifiers, distinguished by a leading FNC1. Input is the familiar
// (AI)value notation, e.g. "(01)09501101530003(17)261200(10)LOT123" — the
// parentheses make the AI boundaries explicit, so parsing needs no length table.
//
// Two encodings share one FNC1-placement rule:
//   • a leading FNC1 marks the symbol as GS1-128, and
//   • a FNC1 SEPARATOR follows a VARIABLE-length element string only when
//     another element string follows it (fixed-length AIs self-delimit).
// The screen barcode (JsBarcode) gets FNC1 as char 207; the printer gets the
// (AI)value string in native ^BC mode D and inserts every FNC1 itself.

// GS1 char 207 is JsBarcode's FNC1 (see node_modules/jsbarcode CODE128 consts).
const FNC1 = String.fromCharCode(207);

// AIs whose element-string length is predefined (GS1 General Specifications
// Fig. 7.8.6-1), keyed by the AI's first two digits → total length incl the AI.
// A predefined (fixed) AI needs no trailing FNC1 separator; all others are
// variable-length. Only the KEY set matters for FNC1 placement.
const FIXED_PREFIX_LEN = {
    '00': 20, '01': 16, '02': 16, '03': 16, '04': 18,
    '11': 8, '12': 8, '13': 8, '14': 8, '15': 8, '16': 8, '17': 8, '18': 8, '19': 8,
    '20': 4, '31': 10, '32': 10, '33': 10, '34': 10, '35': 10, '36': 10, '41': 16,
};

// Is this AI predefined (fixed) length? (drives FNC1 separator placement)
export function isFixedAi(ai) {
    return Object.prototype.hasOwnProperty.call(FIXED_PREFIX_LEN, String(ai).slice(0, 2));
}

// GS1 mod-10 check digit for a GTIN/GLN/SSCC data string (no check digit):
// weight the rightmost data digit ×3, then alternate ×1/×3 leftward.
export function gtinCheckDigit(digits) {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
        const d = digits.charCodeAt(digits.length - 1 - i) - 48;
        sum += d * (i % 2 === 0 ? 3 : 1);
    }
    return (10 - (sum % 10)) % 10;
}

// Common AIs → { label, n (fixed data length) | max (variable cap), numeric,
// check:'gtin' }. Used for value hints + validation, not for FNC1 placement.
export const AI_TABLE = {
    '00': { label: 'SSCC', n: 18, numeric: true, check: 'gtin' },
    '01': { label: 'GTIN', n: 14, numeric: true, check: 'gtin' },
    '02': { label: 'Content GTIN', n: 14, numeric: true, check: 'gtin' },
    '10': { label: 'Batch/Lot', max: 20 },
    '11': { label: 'Production date', n: 6, numeric: true },
    '12': { label: 'Due date', n: 6, numeric: true },
    '13': { label: 'Packaging date', n: 6, numeric: true },
    '15': { label: 'Best-before date', n: 6, numeric: true },
    '16': { label: 'Sell-by date', n: 6, numeric: true },
    '17': { label: 'Expiry date', n: 6, numeric: true },
    '20': { label: 'Variant', n: 2, numeric: true },
    '21': { label: 'Serial number', max: 20 },
    '22': { label: 'Consumer product variant', max: 20 },
    '30': { label: 'Count', max: 8, numeric: true },
    '37': { label: 'Count of units', max: 8, numeric: true },
    '240': { label: 'Additional item ID', max: 30 },
    '241': { label: 'Customer part number', max: 30 },
    '400': { label: 'Order number', max: 30 },
    '410': { label: 'Ship-to GLN', n: 13, numeric: true, check: 'gtin' },
    '414': { label: 'Location GLN', n: 13, numeric: true, check: 'gtin' },
    '422': { label: 'Country of origin', n: 3, numeric: true },
};

// Resolve an AI's constraints: explicit table entry, else derive from the
// predefined-length prefix (e.g. 3103 → 6 numeric), else null (unknown).
function aiMeta(ai) {
    if (AI_TABLE[ai]) { return AI_TABLE[ai]; }
    if (isFixedAi(ai)) {
        return { label: `AI ${ai}`, n: FIXED_PREFIX_LEN[ai.slice(0, 2)] - ai.length, numeric: true };
    }
    return null;
}

// Parse "(AI)value(AI)value…" into [{ ai, value, fixed }]. Values run to the
// next "(" so the parentheses alone delimit them — no length table needed.
export function parseGs1(raw) {
    const s = String(raw == null ? '' : raw);
    const segs = [];
    const re = /\((\d{2,4})\)([^(]*)/g;
    let m;
    while ((m = re.exec(s)) !== null) {
        segs.push({ ai: m[1], value: m[2], fixed: isFixedAi(m[1]) });
    }
    return segs;
}

// Screen payload for JsBarcode CODE128: leading FNC1 + each AI+value, with a
// FNC1 separator after a variable-length element string that is followed by
// another. JsBarcode's auto encoder keeps embedded char-207 FNC1s intact.
export function gs1ForJsBarcode(segs) {
    let out = FNC1;
    segs.forEach((s, i) => {
        out += s.ai + s.value;
        if (!s.fixed && i !== segs.length - 1) { out += FNC1; }
    });
    return out;
}

// Human-readable interpretation: the (AI)value notation. Also the field data we
// hand the printer in native ^BC mode D — the firmware strips the parentheses,
// inserts the leading + separator FNC1s, and adds the Code 128 check digit.
export function gs1Hri(segs) {
    return segs.map((s) => `(${s.ai})${s.value}`).join('');
}

// Validate for UI hints: needs ≥1 AI; each AI known (or predefined-length),
// right data length, digits where required, and a correct GTIN/SSCC/GLN check
// digit. Never blocks encoding — just surfaces mistakes.
export function validateGs1(raw) {
    const segs = parseGs1(raw);
    if (!segs.length) {
        return { ok: false, error: 'Use (AI)value, e.g. (01)09501101530003(17)261200(10)LOT1.' };
    }
    for (const s of segs) {
        const meta = aiMeta(s.ai);
        if (!meta) { return { ok: false, error: `Unknown AI (${s.ai}).` }; }
        if (meta.numeric && !/^\d*$/.test(s.value)) {
            return { ok: false, error: `AI (${s.ai}) ${meta.label} is digits only.` };
        }
        if (meta.n != null && s.value.length !== meta.n) {
            return { ok: false, error: `AI (${s.ai}) ${meta.label} needs ${meta.n} digits.` };
        }
        if (meta.max != null && (s.value.length < 1 || s.value.length > meta.max)) {
            return { ok: false, error: `AI (${s.ai}) ${meta.label} is 1–${meta.max} characters.` };
        }
        if (meta.check === 'gtin') {
            const body = s.value.slice(0, -1), cd = s.value.charCodeAt(s.value.length - 1) - 48;
            if (!/^\d+$/.test(s.value) || gtinCheckDigit(body) !== cd) {
                return { ok: false, error: `AI (${s.ai}) ${meta.label} check digit is wrong.` };
            }
        }
    }
    return { ok: true, error: null };
}
