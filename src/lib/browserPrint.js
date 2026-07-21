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
