<script>
    import { store } from '../lib/store.svelte.js';
    import {
        MEDIA_PRESETS, isCustom, clampDivisions, clampSpacing,
        MAX_DIVISIONS, MAX_SPACING, resolveDesign, resolveLabel, pageFromMedia,
    } from '../lib/size.js';
    import { ui, closeInspector } from '../lib/ui.svelte.js';
    import { printer, printerOptions, selectedDevice, ensurePrinters, loadPrinters, rememberPrinter } from '../lib/printer.svelte.js';
    import { queryMedia } from '../lib/browserPrint.js';
    import { OUTPUT_METHODS, getMethod, BROWSER_PRINT_INSTALL_URL, BROWSER_PRINT_SSL_URL } from '../lib/output.js';
    import { ZPL_DPIS } from '../lib/zpl.js';
    import Drawer from './Drawer.svelte';
    import Select from './Select.svelte';

    // The inspector is a persistent right column on desktop and a slide-in sheet
    // on mobile. matchMedia decides which; Drawer's `persistent` handles the rest.
    let desktop = $state(true);
    $effect(() => {
        const mq = window.matchMedia('(min-width: 768px)');
        desktop = mq.matches;
        const on = () => { desktop = mq.matches; };
        mq.addEventListener('change', on);
        return () => mq.removeEventListener('change', on);
    });

    // ----- Setup -----
    const mediaGroups = Object.entries(MEDIA_PRESETS).reduce((acc, [key, v]) => {
        (acc[v.group] ||= []).push({ key, label: v.label });
        return acc;
    }, {});
    const pageOptions = [
        ...Object.entries(mediaGroups).flatMap(([group, entries]) =>
            entries.map((e) => ({ value: e.key, label: e.label, group })),
        ),
        { value: 'custom', label: 'Custom…' },
    ];
    const unitOptions = [{ value: 'mm', label: 'mm' }, { value: 'in', label: 'in' }];

    function onDivisions(event) { store.divisions = clampDivisions(event.target.value); }
    function onMargin(event) { store.margin = clampSpacing(event.target.value); }
    function onGap(event) { store.gap = clampSpacing(event.target.value); }

    // Live readout of the computed geometry (always mm — the canonical unit).
    const pageDims = $derived(resolveDesign(store.page, store.orientation));
    const labelDims = $derived(resolveLabel(store.page, store.divisions, store.margin, store.gap, store.orientation));

    // Seed sensible custom defaults when switching to a custom size.
    $effect(() => {
        if (isCustom(store.page)) {
            if (store.page.width === '') { store.page.width = store.page.unit === 'in' ? 4 : 101.6; }
            if (store.page.height === '') { store.page.height = store.page.unit === 'in' ? 6 : 152.4; }
        }
    });

    // ----- Output -----
    const method = $derived(getMethod(store.output.method));
    const methodOptions = OUTPUT_METHODS.map((m) => ({ value: m.id, label: m.label }));
    const dpiOptions = ZPL_DPIS.map((d) => ({ value: d.value, label: d.label }));
    const saveFormatOptions = [
        { value: 'json', label: 'Label file (.json)' },
        { value: 'txt', label: 'Plain text (.txt)' },
    ];

    let runState = $state('idle'); // idle | running | done | error
    let runMsg = $state('');
    let runNotDetected = $state(false);

    // Remember the chosen printer as the default (shared with output.js/runZebra).
    $effect(() => {
        if (printer.bpState === 'ready' && printer.selectedUid) { rememberPrinter(printer.selectedUid); }
    });

    async function detectSize() {
        if (!selectedDevice()) { await ensurePrinters(); }
        const device = selectedDevice();
        if (!device) { printer.detectState = 'error'; printer.detectMsg = 'Select a printer first.'; return; }
        printer.detectState = 'querying';
        printer.detectMsg = '';
        try {
            const media = await queryMedia(device);
            printer.lastMedia = media;
            const spec = pageFromMedia(media, store.page);
            if (!spec) {
                printer.detectState = 'unsupported';
                printer.detectMsg = "Couldn't read a size — try calibrating the printer, then retry.";
                return;
            }
            store.page = spec; // flows to applySize + @page reactively
            printer.detectState = 'done';
            printer.detectMsg = media.lengthMm != null
                ? `Length ${media.lengthMm} mm set from the printer. Width isn't sensed — confirm it below.`
                : `Width suggested at ${media.widthMm} mm — confirm the size below.`;
        } catch (e) {
            if (e && e.code === 'not-detected') { printer.detectState = 'unsupported'; printer.detectMsg = 'Browser Print not reachable.'; }
            else { printer.detectState = 'error'; printer.detectMsg = 'Query failed.'; }
        }
    }

    async function runOutput() {
        runState = 'running';
        runMsg = '';
        runNotDetected = false;
        try {
            const result = await method.run({ store, dpi: store.output.dpi, saveFormat: store.output.saveFormat });
            runState = result.ok ? 'done' : 'error';
            runMsg = result.message || '';
            runNotDetected = !!result.notDetected;
        } catch (e) {
            runState = 'error';
            runMsg = (e && e.message) || 'Something went wrong.';
        }
    }
</script>

<Drawer id="inspector-panel" side="right" persistent={desktop} open={ui.inspectorOpen} title="Setup & print"
        widthClass="w-[min(20rem,calc(100vw-2.5rem))] lg:w-[22rem]" onClose={closeInspector}>
    <!-- ===== Setup ===== -->
    <section class="flex flex-col gap-3" aria-label="Label setup">
        <span class="group-label">Setup</span>

        <div class="control-group">
            <span class="group-label">Page / media</span>
            <Select id="page-size" ariaLabel="Page / media size" class="w-full" options={pageOptions} bind:value={store.page.preset} />
            {#if isCustom(store.page)}
                <div class="mt-1 flex flex-wrap items-center gap-[0.4rem] text-[0.85rem]">
                    <input type="number" id="page-width" class="w-[6ch]" min="5" max="1000" step="0.1" aria-label="Page width" bind:value={store.page.width} />
                    <span aria-hidden="true">&times;</span>
                    <input type="number" id="page-height" class="w-[6ch]" min="5" max="1000" step="0.1" aria-label="Page height" bind:value={store.page.height} />
                    <Select ariaLabel="Page size unit" class="w-[4.75rem]" options={unitOptions} bind:value={store.page.unit} />
                </div>
            {/if}
        </div>

        <div class="control-group">
            <span class="group-label">Orientation</span>
            <div class="flex gap-2" role="group" aria-label="Orientation">
                <button type="button" id="orient-portrait" class="btn flex-1" class:btn-active={store.orientation === 'portrait'} aria-pressed={store.orientation === 'portrait'} onclick={() => (store.orientation = 'portrait')}>Portrait</button>
                <button type="button" id="orient-landscape" class="btn flex-1" class:btn-active={store.orientation === 'landscape'} aria-pressed={store.orientation === 'landscape'} onclick={() => (store.orientation = 'landscape')}>Landscape</button>
            </div>
        </div>

        <div class="flex flex-wrap gap-x-5 gap-y-3">
            <div class="control-group">
                <span class="group-label">Divide into</span>
                <div class="group-row">
                    <input type="number" id="divisions" class="w-[7ch]" min="1" max={MAX_DIVISIONS} step="1" aria-label="Number of labels per page" value={store.divisions} oninput={onDivisions} />
                    <span class="text-[0.8rem] text-ink/70">up</span>
                </div>
            </div>
            <div class="control-group">
                <span class="group-label">Margin</span>
                <div class="group-row">
                    <input type="number" id="page-margin" class="w-[7ch]" min="0" max={MAX_SPACING} step="0.5" aria-label="Page margin in millimetres" value={store.margin} oninput={onMargin} />
                    <span class="text-[0.8rem] text-ink/70">mm</span>
                </div>
            </div>
            <div class="control-group">
                <span class="group-label">Gap</span>
                <div class="group-row">
                    <input type="number" id="label-gap" class="w-[7ch]" min="0" max={MAX_SPACING} step="0.5" aria-label="Gap between labels in millimetres" value={store.gap} oninput={onGap} />
                    <span class="text-[0.8rem] text-ink/70">mm</span>
                </div>
            </div>
        </div>

        <div id="size-readout" class="rounded-md border-2 border-ink bg-highlight px-3 py-2 text-[0.8rem] leading-[1.5] tabular-nums" role="status" aria-live="polite">
            Each label = <strong>{labelDims.width} × {labelDims.height} mm</strong><br />
            Page {pageDims.width} × {pageDims.height} mm · <strong>{store.divisions} up</strong>
        </div>
    </section>

    <div class="my-1 border-t-2 border-ink/15"></div>

    <!-- ===== Output ===== -->
    <section class="flex flex-col gap-3" aria-label="Print and output">
        <span class="group-label">Output</span>

        <div class="control-group">
            <span class="group-label">Method</span>
            <Select id="output-method" ariaLabel="Output method" class="w-full" options={methodOptions} bind:value={store.output.method} />
        </div>

        {#if method.controls === 'zebra'}
            {#if !printer.discovered && printer.bpState !== 'loading'}
                <button type="button" id="printer-detect" class="btn w-full" onclick={ensurePrinters}>Find label printer</button>
            {:else if printer.bpState === 'loading'}
                <p class="m-0 text-[0.8rem] text-ink/60">Detecting label printers…</p>
            {:else if printer.bpState === 'ready' && printer.printers.length > 0}
                <div class="control-group">
                    <span class="group-label">Printer</span>
                    <div class="group-row">
                        <Select ariaLabel="Label printer" class="min-w-0 flex-1" options={printerOptions()} bind:value={printer.selectedUid} />
                        <button type="button" class="label-tool shrink-0" title="Refresh printer list" aria-label="Refresh printer list" onclick={loadPrinters}>&#8635;</button>
                    </div>
                </div>
                <div class="group-row">
                    <button type="button" id="detect-size" class="btn" disabled={printer.detectState === 'querying'} onclick={detectSize} title="Read the loaded label size from the printer">
                        {printer.detectState === 'querying' ? 'Reading…' : 'Detect size'}
                    </button>
                    <Select ariaLabel="Print resolution" class="min-w-0 flex-1" options={dpiOptions} bind:value={store.output.dpi} />
                </div>
                {#if printer.detectState === 'done'}
                    <p class="m-0 text-[0.8rem] font-bold text-purple" role="status">{printer.detectMsg}</p>
                {:else if printer.detectState === 'error' || printer.detectState === 'unsupported'}
                    <p class="m-0 text-[0.8rem] font-bold text-orange" role="alert">{printer.detectMsg}</p>
                {/if}
            {:else}
                <p class="m-0 text-[0.8rem] text-ink/70">No label printer found. <button type="button" class="font-bold text-purple underline" onclick={loadPrinters}>Retry</button> after checking it's on and connected.</p>
            {/if}
        {:else if method.controls === 'zebraDpi'}
            <div class="control-group">
                <span class="group-label">Resolution</span>
                <Select ariaLabel="Print resolution" class="w-full" options={dpiOptions} bind:value={store.output.dpi} />
            </div>
        {:else if method.controls === 'saveFormat'}
            <div class="control-group">
                <span class="group-label">Format</span>
                <Select ariaLabel="File format" class="w-full" options={saveFormatOptions} bind:value={store.output.saveFormat} />
            </div>
        {/if}

        {#if method.note}
            <p class="m-0 flex gap-2 text-[0.78rem] leading-[1.45]
                      {method.noteTone === 'ok' ? 'text-[#2f6b3a]' : method.noteTone === 'warn' ? 'text-orange' : 'text-ink/60'}">
                <span aria-hidden="true">{method.noteTone === 'warn' ? '⚠' : method.noteTone === 'ok' ? '✓' : 'ℹ'}</span>
                <span>{method.note}</span>
            </p>
        {/if}

        <button type="button" id="output-run" class="btn btn-primary w-full" disabled={runState === 'running'} onclick={runOutput}>
            {runState === 'running' ? (method.busyLabel || method.actionLabel) : method.actionLabel}
        </button>

        {#if runState === 'done' && runMsg}
            <p class="m-0 text-[0.8rem] font-bold text-purple" role="status">✓ {runMsg}</p>
        {:else if runState === 'error' && runNotDetected}
            <p class="m-0 text-[0.8rem] leading-[1.45] text-ink/80" role="alert">
                Zebra <strong>Browser Print</strong> wasn't reached. <a class="font-bold text-purple underline" href={BROWSER_PRINT_INSTALL_URL} target="_blank" rel="noopener">Install it</a>, or if it's installed, accept its certificate once at <a class="font-bold text-purple underline" href={BROWSER_PRINT_SSL_URL} target="_blank" rel="noopener">localhost:9101</a>, then try again. Otherwise pick <strong>Download ZPL</strong>.
            </p>
        {:else if runState === 'error' && runMsg}
            <p class="m-0 text-[0.8rem] font-bold text-orange" role="alert">{runMsg}</p>
        {/if}
    </section>
</Drawer>
