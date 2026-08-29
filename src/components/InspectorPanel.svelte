<script>
    import { store } from '../lib/store.svelte.js';
    import {
        MEDIA_PRESETS, isCustom, clampDivisions, clampSpacing, clampCopies,
        MAX_DIVISIONS, MAX_SPACING, MAX_COPIES,
        resolvePage, resolveLabel, resolveContent, pageFromMedia, exceedsPrintWidth,
    } from '../lib/size.js';
    import { ui, closeInspector } from '../lib/ui.svelte.js';
    import { printer, printerOptions, selectedDevice, ensurePrinters, loadPrinters, rememberPrinter } from '../lib/printer.svelte.js';
    import { queryMedia } from '../lib/browserPrint.js';
    import { OUTPUT_METHODS, getMethod, deviceFor, effectivePage, BROWSER_PRINT_INSTALL_URL, BROWSER_PRINT_SSL_URL } from '../lib/output.js';
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
    // Named for the result, not the mechanism: "None" answers a question about
    // rotation, and the row asks about artwork. The glyphs carry the rest.
    const MEDIA_ORIENTATIONS = [{ value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }];
    const ARTWORK_ROTATIONS = [{ value: 0, label: 'Upright' }, { value: 90, label: 'Sideways' }];

    function onCopies(event) { store.output.copies = clampCopies(event.target.value); }
    function onDivisions(event) { store.divisions = clampDivisions(event.target.value); }
    function onMargin(event) { store.margin = clampSpacing(event.target.value); }
    function onGap(event) { store.gap = clampSpacing(event.target.value); }

    // Both rules below read a named capability rather than a device category
    // (see output.js). Every measurement here reads the EFFECTIVE page, and the
    // media control shows that same value, which is why it can be disabled
    // without lying about what will print.
    const device = $derived(deviceFor(store.output.method));
    const effPage = $derived(effectivePage(store));

    // Live readout of the computed geometry (always mm — the canonical unit).
    // Artwork rotation changes neither the page nor the label, only the surface
    // the design is laid out on, which is what contentDims reports.
    const pageDims = $derived(resolvePage(effPage));
    const labelDims = $derived(resolveLabel(effPage, store.divisions, store.margin, store.gap));
    const contentDims = $derived(resolveContent(effPage, store.divisions, store.margin, store.gap, store.rotation));

    // Resolved for real rather than drawn as a generic icon: a preview has to be
    // this stock at this orientation.
    // Why the media row is off, in the panel rather than in a title attribute.
    // The second wording appears only when the stored and shown values differ.
    const mediaNote = $derived(
        device.mediaTurns ? null
            : store.page.orientation === 'landscape'
                ? 'Roll stock feeds one way. Landscape returns with sheet output.'
                : 'Roll stock feeds one way. Only sheet media turns.',
    );

    const mediaShapes = $derived({
        portrait: resolvePage({ ...store.page, orientation: 'portrait' }),
        landscape: resolvePage({ ...store.page, orientation: 'landscape' }),
    });

    // ---- Option glyphs ----
    // Every glyph is a box at the option's real proportion plus interior
    // strokes, so one snippet draws both rows. The aspect is clamped for DRAWING
    // only, since flat stock (a 5-up 4×6 label is 100 × 30) collapses to a line
    // at 19px; the exact numbers are in the readout below. Artwork clamps harder
    // because within that row both options are the same shape, so proportion is
    // not what distinguishes them and the bars need somewhere to live.
    const SPAN = 18;   // longest edge, centred in a 24 × 24 viewBox
    function glyphBox(w, h, max) {
        const a = Math.min(max, Math.max(1 / max, w / h));
        const b = a >= 1 ? { w: SPAN, h: SPAN / a } : { w: SPAN * a, h: SPAN };
        return { ...b, x: (24 - b.w) / 2, y: (24 - b.h) / 2 };
    }

    // The media's strokes are the cuts between labels, which is what stops a
    // bare rectangle reading as a single label. Capped at four so a 50-up page
    // stays a picture rather than a hatch.
    function pageGlyph(dims, divisions) {
        const b = glyphBox(dims.width, dims.height, 2.5);
        const n = Math.min(clampDivisions(divisions), 4);
        return { b, lines: Array.from({ length: n - 1 }, (_, i) => {
            const y = b.y + (b.h * (i + 1)) / n;
            return { x1: b.x, y1: y, x2: b.x + b.w, y2: y, w: 1 };
        }) };
    }

    // The artwork's are lines of text, running along the axis it reads on. Bars
    // rather than a letterform because at 19px a rotated "A" is a smudge. Two in
    // a shallow box, three where there is room, so they never merge into a block.
    function artworkGlyph(dims, turned) {
        const b = glyphBox(dims.width, dims.height, 1.6);
        const len = turned ? b.h : b.w;     // the axis a bar runs along
        const span = turned ? b.w : b.h;    // the axis they are spaced along
        const inset = Math.max(1.2, len * 0.16);
        const count = span >= 12 ? 3 : 2;
        return { b, lines: Array.from({ length: count }, (_, i) => {
            const p = (span * (i + 1)) / (count + 1);
            return turned
                ? { x1: b.x + p, y1: b.y + inset, x2: b.x + p, y2: b.y + len - inset, w: 1.6, cap: 'round' }
                : { x1: b.x + inset, y1: b.y + p, x2: b.x + len - inset, y2: b.y + p, w: 1.6, cap: 'round' };
        }) };
    }

    // A cleared number input binds to null, not '' — so test for "blank", and do
    // it in two places for two different reasons.
    const isBlank = (v) => v === '' || v == null || isNaN(parseFloat(v));
    const seedFor = (key) => (store.page.unit === 'in' ? (key === 'width' ? 4 : 6) : (key === 'width' ? 101.6 : 152.4));

    // 1. Seed sensible defaults on ENTERING custom mode. Guarded so it runs once
    //    per switch and never re-fills a field mid-edit while you retype it.
    let seeded = false;
    $effect(() => {
        if (!isCustom(store.page)) { seeded = false; return; }
        if (seeded) { return; }
        seeded = true;
        if (isBlank(store.page.width)) { store.page.width = seedFor('width'); }
        if (isBlank(store.page.height)) { store.page.height = seedFor('height'); }
    });

    // 2. Restore a real value when a field is LEFT blank. Otherwise the box looked
    //    empty while resolvePage silently fell through to its 4x6 fallback, so the
    //    printed size was not the size on screen.
    function onSizeBlur(key) {
        if (isBlank(store.page[key])) { store.page[key] = seedFor(key); }
    }

    // ----- Output -----
    const method = $derived(getMethod(store.output.method));
    const methodOptions = OUTPUT_METHODS.map((m) => ({ value: m.id, label: m.label }));

    // A fixed head clips media wider than itself and no rotation can fix that.
    // An output with no head has no limit, which is how an A4 sheet stays a
    // legitimate 210 mm wide.
    const tooWide = $derived(exceedsPrintWidth(effPage, device.maxWidthMm));
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
                printer.detectMsg = "Couldn't read a size. Calibrate the printer, then retry.";
                return;
            }
            store.page = spec; // flows to applySize + @page reactively
            printer.detectState = 'done';
            printer.detectMsg = media.lengthMm != null
                ? `Length ${media.lengthMm} mm set from the printer. Width isn't sensed, so check it below.`
                : `Width suggested at ${media.widthMm} mm. Check the size below.`;
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

<!-- Stroke is currentColor, so a selected option's glyph inverts with its label. -->
{#snippet glyph({ b, lines })}
    <svg class="size-[1.3em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="1.5" stroke-width="1.9" />
        {#each lines as l}
            <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke-width={l.w} stroke-linecap={l.cap} />
        {/each}
    </svg>
{/snippet}

<!-- Shown wherever Browser Print fails to connect: where to get it + how to set
     it up. Browser Print is a small Zebra helper app that runs a local service
     this page talks to, so labels print at exact size. -->
{#snippet browserPrintHelp()}
    <div class="rounded-md border-2 border-ink/15 bg-highlight/60 px-3 py-2 text-[0.8rem] leading-[1.5]" role="alert">
        <p class="m-0 font-bold">Zebra Browser Print not found</p>
        <p class="m-0 mt-1 text-ink/80">It is a small Zebra helper app that lets this page send labels straight to your printer.</p>
        <ol class="m-0 mt-1.5 list-decimal space-y-0.5 pl-4 text-ink/80">
            <li><a class="font-bold text-purple underline" href={BROWSER_PRINT_INSTALL_URL} target="_blank" rel="noopener">Download and install Browser Print</a>.</li>
            <li>Open it and leave it running in the background.</li>
            <li>On an HTTPS page, open <a class="font-bold text-purple underline" href={BROWSER_PRINT_SSL_URL} target="_blank" rel="noopener">localhost:9101</a> once and accept the certificate.</li>
        </ol>
        <p class="m-0 mt-1.5">Then <button type="button" class="font-bold text-purple underline" onclick={loadPrinters}>Retry</button>. If you have no Zebra, switch the method to <strong>Download ZPL</strong>.</p>
    </div>
{/snippet}

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
                    <input type="number" id="page-width" class="w-[9ch]" min="5" max="1000" step="0.1" aria-label="Media width, across the print head" bind:value={store.page.width} onblur={() => onSizeBlur('width')} />
                    <span aria-hidden="true">&times;</span>
                    <input type="number" id="page-height" class="w-[9ch]" min="5" max="1000" step="0.1" aria-label="Label length, in the feed direction" bind:value={store.page.height} onblur={() => onSizeBlur('height')} />
                    <Select ariaLabel="Page size unit" class="w-[4.75rem]" options={unitOptions} bind:value={store.page.unit} />
                </div>
                <!-- Which number is which is the single most common way to get label
                     media wrong, so name the two axes rather than "width × height". -->
                <p class="m-0 mt-1 text-[0.75rem] leading-[1.45] text-ink/60">
                    <strong>Width</strong> across the print head &times; <strong>length</strong> in the feed direction. A 100 &times; 150 mm roll feeds its 100 mm edge first.
                </p>
            {/if}
            {#if tooWide}
                <p class="m-0 mt-1 text-[0.78rem] leading-[1.45] font-bold text-orange" role="alert">
                    ⚠ {pageDims.width} mm is wider than the {device.maxWidthMm} mm printhead. The right edge won't print. Check the width is across the head, not the feed.
                </p>
            {/if}
        </div>

        <!-- Two rows of ONE group, each option previewing its own result.
             Adjacency alone only says the two are related; the glyphs say how
             they differ, since the media pair changes shape between its options
             and the artwork pair does not. -->
        <div class="control-group">
            <span class="group-label">Orientation</span>
            <div class="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
                <span id="orient-media-label" class="text-[0.8rem] text-ink/70">Media</span>
                <!-- Bound to the EFFECTIVE orientation, not the stored one, so a
                     disabled row still reports what will print. -->
                <div class="segmented segmented-glyph" role="group" aria-labelledby="orient-media-label">
                    {#each MEDIA_ORIENTATIONS as opt}
                        <input type="radio" id={`media-${opt.value}`} name="media-orientation" value={opt.value}
                               disabled={!device.mediaTurns} checked={effPage.orientation === opt.value}
                               onchange={() => (store.page.orientation = opt.value)} />
                        <label for={`media-${opt.value}`}>{@render glyph(pageGlyph(mediaShapes[opt.value], store.divisions))}{opt.label}</label>
                    {/each}
                </div>

                <span id="orient-art-label" class="text-[0.8rem] text-ink/70">Artwork</span>
                <div class="segmented segmented-glyph" role="group" aria-labelledby="orient-art-label">
                    {#each ARTWORK_ROTATIONS as opt}
                        <input type="radio" id={`rotate-${opt.value}`} name="artwork-rotation" value={opt.value} bind:group={store.rotation} />
                        <label for={`rotate-${opt.value}`}>{@render glyph(artworkGlyph(labelDims, opt.value === 90))}{opt.label}</label>
                    {/each}
                </div>
            </div>
            {#if mediaNote}
                <p class="m-0 text-[0.75rem] leading-[1.45] text-ink/60">{mediaNote}</p>
            {/if}
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
                    <input type="number" id="page-margin" class="w-[9ch]" min="0" max={MAX_SPACING} step="0.5" aria-label="Page margin in millimetres" value={store.margin} oninput={onMargin} />
                    <span class="text-[0.8rem] text-ink/70">mm</span>
                </div>
            </div>
            <div class="control-group">
                <span class="group-label">Gap</span>
                <div class="group-row">
                    <input type="number" id="label-gap" class="w-[9ch]" min="0" max={MAX_SPACING} step="0.5" aria-label="Gap between labels in millimetres" value={store.gap} oninput={onGap} />
                    <span class="text-[0.8rem] text-ink/70">mm</span>
                </div>
            </div>
        </div>

        <label class="flex items-center gap-2 text-[0.85rem]">
            <input type="checkbox" id="show-borders" class="size-4 accent-purple" bind:checked={store.showBorders} />
            <span>Show label borders <span class="text-ink/60">(cut guides)</span></span>
        </label>

        <div id="size-readout" class="rounded-md border-2 border-ink bg-highlight px-3 py-2 text-[0.8rem] leading-[1.5] tabular-nums" role="status" aria-live="polite">
            Each label <strong>{labelDims.width} × {labelDims.height} mm</strong><br />
            <!-- At rotation 90 the design is laid out on the label with its
                 sides swapped, which is the number that answers "does my text
                 fit". It was the one dimension the panel never showed. -->
            {#if store.rotation === 90}
                Artwork area <strong>{contentDims.width} × {contentDims.height} mm</strong> <span class="text-ink/70">(turned)</span><br />
            {/if}
            Media {pageDims.width} × {pageDims.height} mm · <strong>{store.divisions} up</strong>
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
            {:else if printer.bpState === 'unavailable'}
                {@render browserPrintHelp()}
            {:else}
                <p class="m-0 text-[0.8rem] text-ink/70">Browser Print is running but found no printer. Check your Zebra is on and connected, then <button type="button" class="font-bold text-purple underline" onclick={loadPrinters}>Retry</button>.</p>
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

        {#if method.controls === 'zebra' || method.controls === 'zebraDpi'}
            <div class="control-group">
                <span class="group-label">Copies</span>
                <div class="group-row">
                    <input type="number" id="output-copies" class="w-[7ch]" min="1" max={MAX_COPIES} step="1" aria-label="Number of copies" value={store.output.copies} oninput={onCopies} />
                    <span class="text-[0.8rem] text-ink/70">of the whole job</span>
                </div>
            </div>
        {/if}

        <button type="button" id="output-run" class="btn btn-primary w-full" disabled={runState === 'running'} onclick={runOutput}>
            {runState === 'running' ? (method.busyLabel || method.actionLabel) : method.actionLabel}
        </button>

        {#if runState === 'done' && runMsg}
            <p class="m-0 text-[0.8rem] font-bold text-purple" role="status">✓ {runMsg}</p>
        {:else if runState === 'error' && runNotDetected}
            <p class="m-0 text-[0.8rem] leading-[1.45] text-ink/80" role="alert">Zebra <strong>Browser Print</strong> was not reached. Follow the setup steps above, or switch the method to <strong>Download ZPL</strong>.</p>
        {:else if runState === 'error' && runMsg}
            <p class="m-0 text-[0.8rem] font-bold text-orange" role="alert">{runMsg}</p>
        {/if}
    </section>
</Drawer>
