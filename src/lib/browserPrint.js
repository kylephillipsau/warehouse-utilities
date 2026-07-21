// Zebra Browser Print integration — send raw ZPL straight to a USB/network Zebra
// via the Browser Print service the user installs on their PC (a localhost web
// service). This bypasses the browser print pipeline entirely, so labels print
// at exact size. A page served over HTTPS must use the 9101 (https) endpoint;
// http://localhost:9100 is blocked as mixed content.
//
// If the service isn't installed/running, every call rejects with code
// 'not-detected' so the UI can fall back to the .zpl download + an install link.

export const BROWSER_PRINT_INSTALL_URL =
    'https://www.zebra.com/us/en/support-downloads/software/printer-software/browser-print.html';
// The self-signed cert's CN is "localhost"; users accept it once here.
export const BROWSER_PRINT_SSL_URL = 'https://localhost:9101/ssl_support';

// Use "localhost" (not 127.0.0.1) so the self-signed cert validates. HTTPS pages
// must reach :9101; :9100 is only usable from a plain-HTTP (dev) page.
const BASES = ['https://localhost:9101', 'http://localhost:9100'];
let cachedBase = null;

async function fetchWithTimeout(url, opts = {}, timeoutMs = 3000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        return await fetch(url, { ...opts, signal: ctrl.signal });
    } finally {
        clearTimeout(timer);
    }
}

// Find a reachable Browser Print base URL (https first). Returns null if none.
export async function detectBase() {
    if (cachedBase) { return cachedBase; }
    for (const base of BASES) {
        try {
            const res = await fetchWithTimeout(base + '/available', {}, 3000);
            if (res && res.ok) { cachedBase = base; return base; }
        } catch (e) { /* not this base */ }
    }
    return null;
}

export async function getDefaultDevice(base) {
    const res = await fetchWithTimeout(base + '/default?type=printer', {}, 4000);
    if (!res.ok) { throw new Error('No default printer'); }
    return res.json();
}

export async function listPrinters(base) {
    const res = await fetchWithTimeout(base + '/available', {}, 4000);
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data.printer) ? data.printer : [];
}

export async function sendZpl(base, device, zpl) {
    // text/plain keeps this a CORS "simple request" (no preflight) — Browser
    // Print doesn't answer OPTIONS. The body is still a JSON string.
    const res = await fetchWithTimeout(base + '/write', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ device, data: zpl }),
    }, 8000);
    if (!res.ok) { throw new Error('Printer rejected the job (HTTP ' + res.status + ')'); }
    return true;
}

// Read whatever is currently in Browser Print's read buffer for a device. Same
// CORS-simple shape as /write (text/plain body, no preflight). The body carries
// just the device — no `data`.
async function readOnce(base, device, timeoutMs = 1500) {
    const res = await fetchWithTimeout(base + '/read', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ device }),
    }, timeoutMs);
    if (!res.ok) { throw new Error('read failed (HTTP ' + res.status + ')'); }
    return res.text();
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Send an SGD/control command, then poll /read until a reply lands or we give
// up. The buffer is usually empty on the first read (the printer hasn't answered
// yet), so we poll a few times. Returns the accumulated raw text (may be '').
export async function readSgd(base, device, cmd, { tries = 8, gapMs = 150 } = {}) {
    await sendZpl(base, device, cmd);
    let acc = '';
    for (let i = 0; i < tries; i++) {
        let chunk = '';
        try { chunk = await readOnce(base, device); } catch (e) { /* keep polling */ }
        if (chunk) { acc += chunk; }
        if (acc.trim()) { break; }
        await delay(gapMs);
    }
    return acc;
}

// SGD getvar replies come back quoted, e.g. `"1218"`. Strip quotes/whitespace.
function unquote(s) {
    return String(s || '').replace(/[\r\n]/g, '').trim().replace(/^"|"$/g, '').trim();
}

// A numeric SGD value we can trust: not empty, not "?", and not a sentinel
// (0 or the 32000 max). Returns the integer or null ("unknown").
function sgdNumber(s) {
    const v = unquote(s);
    if (!v || v === '?') { return null; }
    const n = parseInt(v, 10);
    if (!Number.isFinite(n) || n <= 0 || n >= 32000) { return null; }
    return n;
}

// ~HS host status: three STX/CRLF-delimited strings. String 1 is a comma list
// whose 4th field (index 3) is the label length in dots. Returns dots or null.
function parseHostStatusLength(text) {
    const clean = String(text || '').replace(/[\x02\x03]/g, '');
    const line1 = clean.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0] || '';
    const fields = line1.split(',');
    return fields.length > 3 ? sgdNumber(fields[3]) : null;
}

const round1 = (n) => Math.round(n * 10) / 10;

// Query the loaded media size from the printer. Returns
// { dpi, widthMm, lengthMm, widthSensed, lengthReliable, raw }.
//
// LENGTH is physically sensed (gap sensor) after calibration and is reliable on
// gap/notch/black-mark stock. WIDTH is NOT sensed — ezpl.print_width only echoes
// the printhead's configured width — so widthSensed is always false and callers
// should treat widthMm as a suggestion to confirm. Only throws when the service
// is unreachable / no device (coded errors); unknown values come back as null so
// callers can fall back to manual entry.
export async function queryMedia(device) {
    const base = await detectBase();
    if (!base) { throw Object.assign(new Error('Browser Print service not detected'), { code: 'not-detected' }); }
    if (!device) { throw Object.assign(new Error('No printer selected'), { code: 'no-printer' }); }

    const raw = {};

    // DPI — needed to convert dots→mm. Zebra "203 dpi" is really 203.2 = exactly
    // 8 dots/mm (same convention as zpl.js); default to 203 when unanswered.
    raw.dpi = await readSgd(base, device, '! U1 getvar "head.resolution.in_dpi"\r\n');
    const dpi = sgdNumber(raw.dpi) || 203;
    const dpmm = dpi === 203 ? 8 : dpi / 25.4;
    const dotsToMm = (dots) => dots / dpmm;

    // LENGTH — reliable on gap media after calibration. Fall back to ~HS.
    raw.length = await readSgd(base, device, '! U1 getvar "zpl.label_length"\r\n');
    let lengthDots = sgdNumber(raw.length);
    let lengthReliable = lengthDots != null;
    if (lengthDots == null) {
        raw.hs = await readSgd(base, device, '~HS\r\n');
        lengthDots = parseHostStatusLength(raw.hs);
        lengthReliable = false;
    }

    // WIDTH — configured print width, not a sensor reading. Suggestion only.
    raw.width = await readSgd(base, device, '! U1 getvar "ezpl.print_width"\r\n');
    const widthDots = sgdNumber(raw.width);

    return {
        dpi,
        widthMm: widthDots != null ? round1(dotsToMm(widthDots)) : null,
        lengthMm: lengthDots != null ? round1(dotsToMm(lengthDots)) : null,
        widthSensed: false,
        lengthReliable,
        raw,
    };
}

// Trigger a media calibration so the printer re-senses the loaded label length.
export async function calibrate(device) {
    const base = await detectBase();
    if (!base) { throw Object.assign(new Error('Browser Print service not detected'), { code: 'not-detected' }); }
    await sendZpl(base, device, '~JC\r\n');
    return true;
}

// List every Zebra the local Browser Print service can see, plus which one is
// the default. Rejects with code 'not-detected' if the service isn't reachable.
export async function getPrinters() {
    const base = await detectBase();
    if (!base) { throw Object.assign(new Error('Browser Print service not detected'), { code: 'not-detected' }); }
    let printers = await listPrinters(base).catch(() => []);
    let def = null;
    try { def = await getDefaultDevice(base); } catch (e) { /* no default set */ }
    if (def && !printers.some((p) => p.uid === def.uid)) { printers = [def, ...printers]; }
    return { printers, defaultUid: def ? def.uid : (printers[0] ? printers[0].uid : null) };
}

// Send ZPL to a specific chosen device.
export async function printTo(device, zpl) {
    const base = await detectBase();
    if (!base) { throw Object.assign(new Error('Browser Print service not detected'), { code: 'not-detected' }); }
    if (!device) { throw Object.assign(new Error('No printer selected'), { code: 'no-printer' }); }
    await sendZpl(base, device, zpl);
    return device;
}

// High-level: detect service → pick default printer → send ZPL. Rejects with a
// coded error the UI can branch on ('not-detected' | 'no-printer' | other).
export async function printZpl(zpl) {
    const base = await detectBase();
    if (!base) { throw Object.assign(new Error('Browser Print service not detected'), { code: 'not-detected' }); }
    let device;
    try {
        device = await getDefaultDevice(base);
    } catch (e) {
        const printers = await listPrinters(base).catch(() => []);
        device = printers[0];
    }
    if (!device) { throw Object.assign(new Error('No Zebra printer found by Browser Print'), { code: 'no-printer' }); }
    await sendZpl(base, device, zpl);
    return device;
}
