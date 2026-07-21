<script>
    import { ui } from '../lib/ui.svelte.js';
    import { store, labelsHaveImages } from '../lib/store.svelte.js';
    import { serializeLabels, exportTextLines } from '../lib/serialize.js';
    import { buildZpl, ZPL_DPIS } from '../lib/zpl.js';
    import { getPrinters, printTo, BROWSER_PRINT_INSTALL_URL, BROWSER_PRINT_SSL_URL } from '../lib/browserPrint.js';
    import { dialogSync } from '../actions/dialogSync.js';
    import Select from './Select.svelte';

    const PRINTER_KEY = 'labelMakerPrinter';

    let dlg;
    let zplDpi = $state(203);
    let zplBusy = $state(false);
    let zplError = $state('');
    let printState = $state('idle'); // idle | printing | done | error | not-detected
    let printMsg = $state('');

    // Browser Print device discovery
    let bpState = $state('idle');   // idle | loading | ready | unavailable
    let printers = $state([]);      // [{ uid, name, connection, ... }]
    let selectedUid = $state('');

    const hasImages = $derived(ui.exportOpen && labelsHaveImages());
    const hasPrintable = () => store.labels.some((l) => (l.text && l.text.trim()) || l.image);
    const printerOptions = $derived(printers.map((p) => ({
        value: p.uid,
        label: p.name + (p.connection ? ` (${p.connection})` : ''),
    })));
    const selectedDevice = $derived(printers.find((p) => p.uid === selectedUid) || null);

    // Discover the connected Zebras whenever the dialog opens
    $effect(() => {
        if (ui.exportOpen) { loadPrinters(); }
    });

    // Remember the chosen printer across sessions
    $effect(() => {
        if (bpState === 'ready' && selectedUid) { rememberPrinter(selectedUid); }
    });

    async function loadPrinters() {
        bpState = 'loading';
        try {
            const { printers: list, defaultUid } = await getPrinters();
            printers = list;
            let saved = '';
            try { saved = localStorage.getItem(PRINTER_KEY) || ''; } catch (e) { /* ignore */ }
            selectedUid = (saved && list.some((p) => p.uid === saved)) ? saved : (defaultUid || (list[0] && list[0].uid) || '');
            bpState = 'ready';
        } catch (e) {
            printers = [];
            bpState = 'unavailable';
        }
    }

    function rememberPrinter(uid) {
        try { localStorage.setItem(PRINTER_KEY, uid); } catch (e) { /* ignore */ }
    }

    function downloadBlob(blob, filename) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    function exportJson() {
        const blob = new Blob([JSON.stringify(serializeLabels(), null, 2)], { type: 'application/json' });
        downloadBlob(blob, 'labels.json');
        ui.exportOpen = false;
    }

    function exportText() {
        const blob = new Blob([exportTextLines().join('\n')], { type: 'text/plain' });
        downloadBlob(blob, 'labels.txt');
        ui.exportOpen = false;
    }

    async function exportZpl() {
        zplError = '';
        if (!hasPrintable()) {
            zplError = 'Add a label first — there is nothing to print.';
            return;
        }
        zplBusy = true;
        try {
            const { zpl } = await buildZpl(store, Number(zplDpi));
            downloadBlob(new Blob([zpl], { type: 'application/octet-stream' }), 'labels.zpl');
            ui.exportOpen = false;
        } catch (e) {
            zplError = "Couldn't generate ZPL. " + (e && e.message ? e.message : '');
        } finally {
            zplBusy = false;
        }
    }

    async function printToZebra() {
        zplError = '';
        if (!hasPrintable()) {
            zplError = 'Add a label first — there is nothing to print.';
            return;
        }
        printState = 'printing';
        printMsg = '';
        try {
            // make sure we have a device (retry discovery if the dialog opened
            // before Browser Print was reachable)
            if (!selectedDevice) { await loadPrinters(); }
            const device = selectedDevice;
            if (!device) {
                printState = bpState === 'unavailable' ? 'not-detected' : 'error';
                if (printState === 'error') { printMsg = 'No Zebra printer found.'; }
                return;
            }
            const { zpl } = await buildZpl(store, Number(zplDpi));
            await printTo(device, zpl);
            rememberPrinter(device.uid);
            printState = 'done';
            printMsg = 'Sent to ' + device.name + '.';
        } catch (e) {
            if (e && e.code === 'not-detected') { printState = 'not-detected'; }
            else { printState = 'error'; printMsg = (e && e.message) || 'Print failed.'; }
        }
    }

    function onDialogClick(event) {
        if (event.target === dlg) { ui.exportOpen = false; }
    }
</script>

<dialog id="export-dialog" class="dialog" aria-labelledby="export-title" bind:this={dlg} use:dialogSync={ui.exportOpen} onclose={() => { ui.exportOpen = false; }} onclick={onDialogClick}>
    <div class="flex flex-col gap-3 p-5">
        <span class="group-label" id="export-title">Save labels</span>
        <p class="m-0 text-[0.9rem] leading-[1.4]">
            {#if hasImages}
                Your labels include images - save a label file to keep them. Plain text saves the words only.
            {:else}
                Save a label file to keep images later, or plain text for a simple list.
            {/if}
        </p>
        <div class="flex flex-wrap gap-2">
            <button type="button" class="btn flex-[1_1_12rem]" class:btn-primary={hasImages} id="export-json" onclick={exportJson}>Label file (.json)</button>
            <button type="button" class="btn flex-[1_1_12rem]" class:btn-primary={!hasImages} id="export-text" onclick={exportText}>Plain text (.txt)</button>
        </div>

        <div class="mt-1 flex flex-col gap-2 rounded-lg border-2 border-ink/15 p-3">
            <span class="group-label">Print exact on a Zebra</span>
            <p class="m-0 text-[0.85rem] leading-[1.4] text-ink/80">
                Browser printing can scale labels (Chrome renders at 300&nbsp;dpi). These print at the printer's true dot size. <strong>Print to Zebra</strong> sends straight to a chosen printer via Zebra Browser Print; <strong>Download ZPL</strong> saves a <code>.zpl</code> you send raw (a "Generic / Text Only" queue, or the printer share).
            </p>

            {#if bpState === 'loading'}
                <p class="m-0 text-[0.8rem] text-ink/60">Detecting Zebra printers…</p>
            {:else if bpState === 'ready' && printers.length > 0}
                <div class="flex items-center gap-2 text-[0.85rem]">
                    <span class="whitespace-nowrap">Printer</span>
                    <Select ariaLabel="Zebra printer" class="min-w-0 flex-1" options={printerOptions} bind:value={selectedUid} />
                    <button type="button" class="label-tool shrink-0" title="Refresh printer list" aria-label="Refresh printer list" onclick={loadPrinters}>&#8635;</button>
                </div>
            {:else if bpState === 'ready'}
                <p class="m-0 text-[0.8rem] text-ink/70">No Zebra printers found. <button type="button" class="font-bold text-purple underline" onclick={loadPrinters}>Refresh</button> after checking the printer is on and connected.</p>
            {:else if bpState === 'unavailable'}
                <p class="m-0 text-[0.8rem] text-ink/60">Zebra Browser Print not detected. <button type="button" class="font-bold text-purple underline" onclick={loadPrinters}>Retry</button></p>
            {/if}

            <div class="flex items-center gap-2 text-[0.85rem]">
                <span class="whitespace-nowrap">Resolution</span>
                <Select ariaLabel="Printer resolution" class="w-[15rem] max-w-full" options={ZPL_DPIS.map((d) => ({ value: d.value, label: d.label }))} bind:value={zplDpi} />
            </div>
            <div class="flex flex-wrap items-center gap-2">
                <button type="button" class="btn btn-primary flex-[1_1_11rem]" id="print-zebra" disabled={printState === 'printing'} onclick={printToZebra}>
                    {printState === 'printing' ? 'Printing…' : 'Print to Zebra'}
                </button>
                <button type="button" class="btn flex-[1_1_11rem]" id="export-zpl" disabled={zplBusy} onclick={exportZpl}>
                    {zplBusy ? 'Generating…' : 'Download ZPL'}
                </button>
            </div>
            {#if zplError}
                <p class="m-0 text-[0.85rem] font-bold text-orange" role="alert">{zplError}</p>
            {/if}
            {#if printState === 'done'}
                <p class="m-0 text-[0.85rem] font-bold text-purple" role="status">✓ {printMsg}</p>
            {:else if printState === 'error'}
                <p class="m-0 text-[0.85rem] font-bold text-orange" role="alert">{printMsg}</p>
            {:else if printState === 'not-detected'}
                <p class="m-0 text-[0.85rem] leading-[1.4] text-ink/80" role="alert">
                    Zebra <strong>Browser Print</strong> wasn't reached. <a class="font-bold text-purple underline" href={BROWSER_PRINT_INSTALL_URL} target="_blank" rel="noopener">Install it</a> if you haven't — or if it's already installed, accept its certificate once at <a class="font-bold text-purple underline" href={BROWSER_PRINT_SSL_URL} target="_blank" rel="noopener">localhost:9101</a>, then try again. Otherwise use <strong>Download ZPL</strong>.
                </p>
            {/if}
        </div>

        <div class="flex justify-end">
            <button type="button" class="btn" onclick={() => { ui.exportOpen = false; }}>Cancel</button>
        </div>
    </div>
</dialog>
