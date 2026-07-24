// Shared, app-wide Zebra printer state. The header selector and the Export
// dialog both read/write this single $state object, so the chosen printer is
// one source of truth (selecting in one surface reflects in the other) and the
// choice is the remembered default. Discovery is lazy for first-time visitors —
// nothing probes the Browser Print localhost service until the user asks (see
// ensurePrinters), so users with no Zebra pay no cost on page load. Returning
// users who have connected a Zebra before get a silent auto-connect on load
// (see autoConnectPrinter), so they never have to re-scan.
import { getPrinters } from './browserPrint.js';

export const PRINTER_KEY = 'labelMakerPrinter';

export const printer = $state({
    bpState: 'idle',      // 'idle' | 'loading' | 'ready' | 'unavailable'
    printers: [],         // [{ uid, name, connection, ... }]
    selectedUid: '',
    discovered: false,    // has discovery run at least once?
    // media detection
    detectState: 'idle',  // 'idle' | 'querying' | 'done' | 'error' | 'unsupported'
    detectMsg: '',
    lastMedia: null,      // last queryMedia() result
});

// Reactive getters — Svelte 5 can't export a bare $derived, so components call
// these (they read printer.* and stay reactive).
export function printerOptions() {
    return printer.printers.map((p) => ({
        value: p.uid,
        label: p.name + (p.connection ? ` (${p.connection})` : ''),
    }));
}

export function selectedDevice() {
    return printer.printers.find((p) => p.uid === printer.selectedUid) || null;
}

export function rememberPrinter(uid) {
    try { localStorage.setItem(PRINTER_KEY, uid); } catch (e) { /* ignore */ }
}

export function setPrinter(uid) {
    printer.selectedUid = uid;
    rememberPrinter(uid);
}

// Discover the connected Zebras. Restores the remembered choice if still
// present, else the Browser Print default, else the first printer. Concurrent
// callers (the header + the dialog + a print click) coalesce onto one in-flight
// request, so bpState never flips loading↔ready as two probes race.
let inflight = null;
export function loadPrinters() {
    if (inflight) { return inflight; }
    inflight = (async () => {
        printer.bpState = 'loading';
        try {
            const { printers: list, defaultUid } = await getPrinters();
            printer.printers = list;
            let saved = '';
            try { saved = localStorage.getItem(PRINTER_KEY) || ''; } catch (e) { /* ignore */ }
            printer.selectedUid = (saved && list.some((p) => p.uid === saved))
                ? saved
                : (defaultUid || (list[0] && list[0].uid) || '');
            printer.bpState = 'ready';
        } catch (e) {
            printer.printers = [];
            printer.bpState = 'unavailable';
        } finally {
            printer.discovered = true;
            inflight = null;
        }
    })();
    return inflight;
}

// Discover once, idempotently, and WAIT for the result. Safe to call from both
// the header and the dialog — a second caller awaits the same discovery instead
// of starting a competing one, and won't refetch once ready.
export async function ensurePrinters() {
    if (printer.discovered && printer.bpState !== 'unavailable') { return; }
    await loadPrinters();
}

// True once the user has successfully connected a Zebra (a printer is remembered).
export function hasRememberedPrinter() {
    try { return !!localStorage.getItem(PRINTER_KEY); } catch (e) { return false; }
}

// Silent best-effort auto-connect on page load. We only probe for users who
// have connected a Zebra before (a remembered printer), so first-time and
// non-Zebra visitors pay no page-load cost and never see an error — they get
// the gentle "Find label printer" prompt instead. If the service isn't up right
// now, we reset to the idle prompt rather than surfacing the install help on a
// fresh load (that is reserved for when the user actively finds or prints).
export async function autoConnectPrinter() {
    if (!hasRememberedPrinter()) { return; }
    await loadPrinters();
    if (printer.bpState === 'unavailable') {
        printer.bpState = 'idle';
        printer.discovered = false;
    }
}
