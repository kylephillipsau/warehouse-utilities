<script>
    import { store } from '../lib/store.svelte.js';
    import {
        MEDIA_PRESETS, isCustom, clampDivisions, clampSpacing, clampCopies,
        MAX_DIVISIONS, MAX_SPACING, MAX_COPIES,
        resolvePage, resolveContent, labelShape, pageFromMedia, exceedsPrintWidth,
    } from '../lib/size.js';
    import { ui, closeInspector } from '../lib/ui.svelte.js';
    import { printer, printerOptions, selectedDevice, ensurePrinters, loadPrinters, rememberPrinter } from '../lib/printer.svelte.js';
    import { queryMedia } from '../lib/browserPrint.js';
    import { OUTPUT_METHODS, getMethod, deviceFor, effectivePage, BROWSER_PRINT_INSTALL_URL, BROWSER_PRINT_SSL_URL } from '../lib/output.js';
    import { ZPL_DPIS } from '../lib/zpl.js';
    import { resolveTemplate } from '../lib/tokens.js';
    import Drawer from './Drawer.svelte';
    import Select from './Select.svelte';
    import LabelThumb from './LabelThumb.svelte';

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
    const PAGE_ORIENTATIONS = [{ value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }];

    function onCopies(event) { store.output.copies = clampCopies(event.target.value); }
    function onDivisions(event) { store.divisions = clampDivisions(event.target.value); }
    function onMargin(event) { store.margin = clampSpacing(event.target.value); }
    function onGap(event) { store.gap = clampSpacing(event.target.value); }

    // Both rules below read a named capability rather than a device category
    // (see output.js). Every measurement here reads the EFFECTIVE page, so a
    // landscape sheet stored while a roll printer is selected is measured as
    // the portrait roll that will actually print, and page orientation is only
    // offered at all where the device can turn its media.
    const device = $derived(deviceFor(store.output.method));
    const effPage = $derived(effectivePage(store));

    // Live readout of the computed geometry (always mm, the canonical unit).
    const pageDims = $derived(resolvePage(effPage));

    // Sizes for people, not for the printer: whole millimetres, with one decimal
    // kept only where a millimetre is a large share of the size.
    const mm = (n) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);

    // ---- Label shape ----
    // One question: which way does the label read? Each option is the label as
    // it will be held, so the two differ in SHAPE and the text in both runs
    // left to right. Underneath it is still artwork rotation (0 or 90, the ^FW
    // analogue); the media never changes. The options stay in rotation order
    // rather than sorting by shape, because which rotation reads wide flips with
    // the number of labels per page and a selected option must not jump sides.
    const shapeWord = (d) => { const w = labelShape(d); return w[0].toUpperCase() + w.slice(1); };
    const shapes = $derived.by(() => {
        const opts = [0, 90].map((rotation) => {
            const d = resolveContent(effPage, store.divisions, store.margin, store.gap, rotation);
            return { rotation, dims: d, word: shapeWord(d) };
        });
        // Square stock reads the same shape both ways; name the second by what it does.
        if (opts[0].word === opts[1].word) { opts[1].word = 'Turned'; }
        return opts;
    });
    const currentShape = $derived(shapes.find((o) => o.rotation === store.rotation) || shapes[0]);

    // What the previews show: the first real text on the sheet, so the choice
    // is between two pictures of the user's own label. A template contributes
    // its first text field; a sheet with no text yet gets a location code.
    const sampleText = $derived.by(() => {
        for (const l of store.labels) {
            if (l.fields && l.fields.length) {
                const f = l.fields.find((x) => x.type !== 'barcode' && resolveTemplate(x.value).trim());
                if (f) { return resolveTemplate(f.value); }
            } else if (l.text && l.text.trim()) {
                return l.text;
            }
        }
        return 'A-01-03';
    });

    // ---- Page orientation glyphs ----
    // Only offered where the output can turn its media (sheet printing). Each
    // option draws the page at its real proportion with the cuts between
    // labels, which is what stops a bare rectangle reading as a single label.
    const pageShapes = $derived({
        portrait: resolvePage({ ...store.page, orientation: 'portrait' }),
        landscape: resolvePage({ ...store.page, orientation: 'landscape' }),
    });
    const SPAN = 18;   // longest edge, centred in a 24 × 24 viewBox
    function pageGlyph(dims, divisions) {
        const a = Math.min(2.5, Math.max(1 / 2.5, dims.width / dims.height));
        const b0 = a >= 1 ? { w: SPAN, h: SPAN / a } : { w: SPAN * a, h: SPAN };
        const b = { ...b0, x: (24 - b0.w) / 2, y: (24 - b0.h) / 2 };
        const n = Math.min(clampDivisions(divisions), 4);   // a picture, not a hatch
        return { b, lines: Array.from({ length: n - 1 }, (_, i) => {
            const y = b.y + (b.h * (i + 1)) / n;
            return { x1: b.x, y1: y, x2: b.x + b.w, y2: y };
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
            <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke-width="1" />
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
            <!-- Part of choosing the paper, and only where it is a choice: a roll
                 feeds one way, so for a label printer there is nothing to show. The
                 stored value survives there (see output.effectivePage). -->
            {#if device.mediaTurns}
                <div class="segmented segmented-glyph mt-1" role="group" aria-label="Page orientation">
                    {#each PAGE_ORIENTATIONS as opt}
                        <input type="radio" id={`media-${opt.value}`} name="media-orientation" value={opt.value}
                               checked={store.page.orientation === opt.value}
                               onchange={() => (store.page.orientation = opt.value)} />
                        <label for={`media-${opt.value}`}>{@render glyph(pageGlyph(pageShapes[opt.value], store.divisions))}{opt.label}</label>
                    {/each}
                </div>
            {/if}
            {#if tooWide}
                <p class="m-0 mt-1 text-[0.78rem] leading-[1.45] font-bold text-orange" role="alert">
                    ⚠ {pageDims.width} mm is wider than the {device.maxWidthMm} mm printhead. The right edge won't print. Check the width is across the head, not the feed.
                </p>
            {/if}
        </div>

        <div class="control-group">
            <label class="group-label" for="divisions">Labels per page</label>
            <input type="number" id="divisions" class="w-[7ch]" min="1" max={MAX_DIVISIONS} step="1" value={store.divisions} oninput={onDivisions} />
        </div>

        <!-- Each option is a picture of the label as it will be held, drawn from
             the user's own text, so the choice is "which one looks right". -->
        <div class="control-group">
            <span id="label-shape-label" class="group-label">Label shape</span>
            <div class="segmented segmented-shape" role="radiogroup" aria-labelledby="label-shape-label">
                {#each shapes as opt (opt.rotation)}
                    <input type="radio" id={`rotate-${opt.rotation}`} name="artwork-rotation" value={opt.rotation} bind:group={store.rotation}
                           aria-label={`${opt.word}, ${mm(opt.dims.width)} by ${mm(opt.dims.height)} millimetres`} />
                    <label for={`rotate-${opt.rotation}`}>
                        <LabelThumb width={opt.dims.width} height={opt.dims.height} text={sampleText} />
                        {opt.word}
                    </label>
                {/each}
            </div>
        </div>

        <label class="flex items-center gap-2 text-[0.85rem]">
            <input type="checkbox" id="show-borders" class="size-4 accent-purple" bind:checked={store.showBorders} />
            <span>Show label borders <span class="text-ink/60">(cut guides)</span></span>
        </label>

        <!-- Rarely changed, so folded away; the summary still says what they are. -->
        <details class="spacing-group">
            <summary class="flex cursor-pointer items-center gap-2 text-[0.85rem]">
                <span class="group-label">Spacing</span>
                <span class="text-ink/60">{store.margin} mm margin · {store.gap} mm gap</span>
            </summary>
            <div class="mt-2 flex flex-wrap gap-x-5 gap-y-3">
                <div class="control-group">
                    <label class="text-[0.8rem] text-ink/70" for="page-margin">Margin, page edge</label>
                    <div class="group-row">
                        <input type="number" id="page-margin" class="w-[9ch]" min="0" max={MAX_SPACING} step="0.5" value={store.margin} oninput={onMargin} />
                        <span class="text-[0.8rem] text-ink/70">mm</span>
                    </div>
                </div>
                <div class="control-group">
                    <label class="text-[0.8rem] text-ink/70" for="label-gap">Gap, between labels</label>
                    <div class="group-row">
                        <input type="number" id="label-gap" class="w-[9ch]" min="0" max={MAX_SPACING} step="0.5" value={store.gap} oninput={onGap} />
                        <span class="text-[0.8rem] text-ink/70">mm</span>
                    </div>
                </div>
            </div>
        </details>

        <!-- Leads with the label as it will be held (turned when the shape is),
             then the stock it comes off. -->
        <div id="size-readout" class="rounded-md border-2 border-ink bg-highlight px-3 py-2 text-[0.8rem] leading-[1.5] tabular-nums" role="status" aria-live="polite">
            Each label <strong>{mm(currentShape.dims.width)} × {mm(currentShape.dims.height)} mm</strong>, {currentShape.word.toLowerCase()}<br />
            <span class="text-ink/70">{store.divisions} per {mm(pageDims.width)} × {mm(pageDims.height)} mm page</span>
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

    </section>

    <!-- The action and its result, pinned to the bottom of the panel so printing
         never needs a scroll, however tall the setup above it gets. A direct
         child of the scroll container, because sticky cannot leave its parent:
         inside the Output section it would hide whenever that section is below
         the fold, which is exactly when it is needed. The negative margins take
         it edge to edge over the panel's padding, and the negative bottom does
         the same for the sticky edge, which is measured inside that padding. -->
    <div class="sticky -bottom-4 z-[1] -mx-4 -mb-4 mt-auto flex flex-col gap-2 border-t-2 border-ink/15 bg-paper px-4 py-3">
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
    </div>
</Drawer>
