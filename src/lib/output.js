// Output methods — how a finished label sheet leaves the app. This is a small
// data-driven registry so the Inspector's Print section renders generically and
// a NEW label-printer backend is just one more entry here + one run* handler
// (plus, if it needs bespoke controls, one {#if} cluster in InspectorPanel).
// Nothing about the top bar, layout, or persisted-state shape has to change to
// add a printer.
//
// To add a backend, e.g. a Brother/Dymo:
//   1. write its client lib (like browserPrint.js) and a runBrother(ctx) here,
//   2. push { id:'brother', label:'…', device:…, controls:'brother',
//      actionLabel:'…', run: runBrother } to OUTPUT_METHODS,
//   3. if controls:'brother', add that cluster in InspectorPanel's Output section.
// `device` is the load-bearing part of step 2: every physical rule reads it.
import { buildZpl } from './zpl.js';
import { serializeLabels, exportTextLines } from './serialize.js';
import { printTo, BROWSER_PRINT_INSTALL_URL, BROWSER_PRINT_SSL_URL } from './browserPrint.js';
import { selectedDevice, ensurePrinters, rememberPrinter, printer } from './printer.svelte.js';
import { labelIsEmpty } from './fields.js';

export { BROWSER_PRINT_INSTALL_URL, BROWSER_PRINT_SSL_URL };

export const DEFAULT_OUTPUT = { method: 'zebra', dpi: 203, saveFormat: 'json', copies: 1 };

// printable when at least one label has content — classic text/image OR template fields
const hasPrintable = (store) => store.labels.some((l) => !labelIsEmpty(l));

export function downloadBlob(blob, filename) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
}

// --- handlers: each returns { ok, message, tone:'ok'|'error', notDetected? } ---

async function runZebra({ store, dpi }) {
    if (!hasPrintable(store)) { return { ok: false, tone: 'error', message: 'Nothing to print yet. Add a label first.' }; }
    if (!selectedDevice()) { await ensurePrinters(); }
    const device = selectedDevice();
    if (!device) {
        if (printer.bpState === 'unavailable') { return { ok: false, tone: 'error', notDetected: true, message: 'Zebra Browser Print not reached.' }; }
        return { ok: false, tone: 'error', message: 'No Zebra printer found.' };
    }
    try {
        const { zpl } = await buildZpl(store, Number(dpi));
        await printTo(device, zpl);
        rememberPrinter(device.uid);
        return { ok: true, tone: 'ok', message: 'Sent to ' + device.name + '.' };
    } catch (e) {
        if (e && e.code === 'not-detected') { return { ok: false, tone: 'error', notDetected: true, message: 'Zebra Browser Print not reached.' }; }
        return { ok: false, tone: 'error', message: (e && e.message) || 'Print failed.' };
    }
}

async function runZpl({ store, dpi }) {
    if (!hasPrintable(store)) { return { ok: false, tone: 'error', message: 'Nothing to print yet. Add a label first.' }; }
    try {
        const { zpl } = await buildZpl(store, Number(dpi));
        downloadBlob(new Blob([zpl], { type: 'application/octet-stream' }), 'labels.zpl');
        return { ok: true, tone: 'ok', message: 'Saved labels.zpl.' };
    } catch (e) {
        return { ok: false, tone: 'error', message: "Couldn't generate ZPL. " + (e && e.message ? e.message : '') };
    }
}

function runBrowser({ store }) {
    if (!hasPrintable(store)) { return { ok: false, tone: 'error', message: 'Nothing to print yet. Add a label first.' }; }
    window.print();
    return { ok: true, tone: 'ok', message: '' };
}

function runSaveFile({ store, saveFormat }) {
    if (saveFormat === 'txt') {
        downloadBlob(new Blob([exportTextLines().join('\n')], { type: 'text/plain' }), 'labels.txt');
        return { ok: true, tone: 'ok', message: 'Saved labels.txt.' };
    }
    downloadBlob(new Blob([JSON.stringify(serializeLabels(), null, 2)], { type: 'application/json' }), 'labels.json');
    return { ok: true, tone: 'ok', message: 'Saved labels.json.' };
}

// What the DEVICE physically cannot do: `maxWidthMm` is the fixed print head
// (null = no head, so no width is too wide), `mediaTurns` is whether the stock
// can be fed the other way round (false for a roll). Declared rather than
// inferred, because a category test like "is this thermal" has to be kept in
// step by hand with every backend added — and reading it off `controls`, a field
// about which widgets to draw, is how a new fixed-head printer stops being one.
//
// Columns are deliberately NOT a capability: a column is (width − gaps) / cols
// and the width is already bounded, so tiling cannot exceed the head however it
// divides, and 2-across die-cut roll stock exists.
const HEAD_4IN = { maxWidthMm: 104, mediaTurns: false };    // 4-inch thermal head, roll stock
const NO_LIMIT = { maxWidthMm: null, mediaTurns: true };    // ordinary stock on a sheet printer

// The registry. `controls` names which control cluster the Inspector renders,
// `note`/`noteTone` the contextual line under them, `device` the hardware.
export const OUTPUT_METHODS = [
    { id: 'zebra',   label: 'Zebra Browser Print', device: HEAD_4IN, controls: 'zebra',       actionLabel: 'Print to Zebra', busyLabel: 'Printing…',   run: runZebra,
      note: 'Prints at exact physical size straight to the Zebra.', noteTone: 'ok' },
    { id: 'zpl',     label: 'Download ZPL file',   device: HEAD_4IN, controls: 'zebraDpi',    actionLabel: 'Download ZPL',   busyLabel: 'Generating…', run: runZpl,
      note: 'Exact-size .zpl. Send it raw to the printer, either a "Generic / Text Only" queue or the printer share.', noteTone: 'ok' },
    { id: 'browser', label: 'Browser / PDF print', device: NO_LIMIT, controls: 'browserNote', actionLabel: 'Print',          busyLabel: null,          run: runBrowser,
      note: 'Browser print can mis-scale on thermal printers (Chrome renders at ~300 dpi). Set Scale 100% and Margins None. For guaranteed exact size, use Zebra or ZPL.', noteTone: 'warn' },
    { id: 'file',    label: 'Save label file',     device: NO_LIMIT, controls: 'saveFormat',  actionLabel: 'Save file',      busyLabel: null,          run: runSaveFile,
      note: 'Saves your labels (with images) so you can re-open or share them later.', noteTone: 'muted' },
];

export function getMethod(id) {
    return OUTPUT_METHODS.find((m) => m.id === id) || OUTPUT_METHODS[0];
}

export const isMethodId = (id) => OUTPUT_METHODS.some((m) => m.id === id);

export const deviceFor = (id) => getMethod(id).device;

// The page as the current output will actually render it. A roll has one feed
// direction, so a landscape SHEET design must not follow the user onto a label
// printer and emit a ^PW wider than the head. Resolved at read time rather than
// written back, so the setting is still there when they switch away; every
// surface reads this, so screen, @page and ZPL cannot disagree.
export function effectivePage(store) {
    if (!deviceFor(store.output.method).mediaTurns && store.page.orientation === 'landscape') {
        return { ...store.page, orientation: 'portrait' };
    }
    return store.page;
}
