// Output methods — how a finished label sheet leaves the app. This is a small
// data-driven registry so the Inspector's Print section renders generically and
// a NEW label-printer backend is just one more entry here + one run* handler
// (plus, if it needs bespoke controls, one {#if} cluster in InspectorPanel).
// Nothing about the top bar, layout, or persisted-state shape has to change to
// add a printer.
//
// To add a backend, e.g. a Brother/Dymo:
//   1. write its client lib (like browserPrint.js) and a runBrother(ctx) here,
//   2. push { id:'brother', label:'…', exact:…, needsPrinter:…, controls:'brother',
//      actionLabel:'…', run: runBrother } to OUTPUT_METHODS,
//   3. if controls:'brother', add that cluster in InspectorPanel's Output section.
import { buildZpl } from './zpl.js';
import { serializeLabels, exportTextLines } from './serialize.js';
import { printTo, BROWSER_PRINT_INSTALL_URL, BROWSER_PRINT_SSL_URL } from './browserPrint.js';
import { selectedDevice, ensurePrinters, rememberPrinter, printer } from './printer.svelte.js';

export { BROWSER_PRINT_INSTALL_URL, BROWSER_PRINT_SSL_URL };

export const DEFAULT_OUTPUT = { method: 'zebra', dpi: 203, saveFormat: 'json' };

const hasPrintable = (store) => store.labels.some((l) => (l.text && l.text.trim()) || l.image);

function downloadBlob(blob, filename) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
}

// --- handlers: each returns { ok, message, tone:'ok'|'error', notDetected? } ---

async function runZebra({ store, dpi }) {
    if (!hasPrintable(store)) { return { ok: false, tone: 'error', message: 'Add a label first — there is nothing to print.' }; }
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
    if (!hasPrintable(store)) { return { ok: false, tone: 'error', message: 'Add a label first — there is nothing to print.' }; }
    try {
        const { zpl } = await buildZpl(store, Number(dpi));
        downloadBlob(new Blob([zpl], { type: 'application/octet-stream' }), 'labels.zpl');
        return { ok: true, tone: 'ok', message: 'Saved labels.zpl.' };
    } catch (e) {
        return { ok: false, tone: 'error', message: "Couldn't generate ZPL. " + (e && e.message ? e.message : '') };
    }
}

function runBrowser({ store }) {
    if (!hasPrintable(store)) { return { ok: false, tone: 'error', message: 'Add a label first — there is nothing to print.' }; }
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

// The registry. `controls` names which control cluster the Inspector renders;
// `note`/`noteTone` drive the contextual line under the controls.
export const OUTPUT_METHODS = [
    { id: 'zebra',   label: 'Zebra Browser Print', exact: true,  needsPrinter: true,  controls: 'zebra',      actionLabel: 'Print to Zebra', busyLabel: 'Printing…',    run: runZebra,
      note: 'Prints at exact physical size straight to the Zebra.', noteTone: 'ok' },
    { id: 'zpl',     label: 'Download ZPL file',   exact: true,  needsPrinter: false, controls: 'zebraDpi',   actionLabel: 'Download ZPL',   busyLabel: 'Generating…',  run: runZpl,
      note: 'Exact-size .zpl — send it raw to the printer (a "Generic / Text Only" queue or the printer share).', noteTone: 'ok' },
    { id: 'browser', label: 'Browser / PDF print', exact: false, needsPrinter: false, controls: 'browserNote', actionLabel: 'Print',         busyLabel: null,           run: runBrowser,
      note: 'Browser print can mis-scale on thermal printers (Chrome renders at ~300 dpi). Set Scale 100% and Margins None — or use Zebra / ZPL for guaranteed exact size.', noteTone: 'warn' },
    { id: 'file',    label: 'Save label file',     exact: true,  needsPrinter: false, controls: 'saveFormat', actionLabel: 'Save file',      busyLabel: null,           run: runSaveFile,
      note: 'Saves your labels (with images) so you can re-open or share them later.', noteTone: 'muted' },
];

export function getMethod(id) {
    return OUTPUT_METHODS.find((m) => m.id === id) || OUTPUT_METHODS[0];
}

export const isMethodId = (id) => OUTPUT_METHODS.some((m) => m.id === id);
