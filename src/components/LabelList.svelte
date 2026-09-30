<script>
    import { store, insertPreset } from '../lib/store.svelte.js';
    import { tiling, insertionIndex, resolvePage, resolveContent, labelShape, clampRotation } from '../lib/size.js';
    import { effectivePage } from '../lib/output.js';
    import { openImport, openPresets } from '../lib/ui.svelte.js';
    import Label from './Label.svelte';

    // The page divides into N labels; that's how many fit per media page
    const perPage = $derived(tiling(store.divisions).perPage);

    // Flow the labels across as many media pages as needed (at least one page so
    // the media is always visible on screen).
    const pages = $derived.by(() => {
        const per = perPage;
        const out = [];
        for (let i = 0; i < store.labels.length; i += per) {
            out.push(store.labels.slice(i, i + per));
        }
        if (out.length === 0) { out.push([]); }
        return out;
    });

    // --- on-screen scale ---
    // The sheet is laid out at its true size (the text fitter measures that
    // box) and then SCALED for viewing, screen only: down to fit the width on a
    // phone, where a 4-inch roll is wider than the screen, and up for small
    // stock on a large screen, where a 2 × 1 label is a postage stamp. Upscaling
    // stops at a comfortable width and at the height of the view, so a whole
    // page stays visible. A transform leaves layout untouched, which is why
    // fitting and every pointer gesture (they read getBoundingClientRect) need
    // no changes.
    const PX_PER_MM = 96 / 25.4;
    const PAD = 16;              // #labels-section padding
    const COMFORT_W = 560;       // px; upscale no further than this width
    const MAX_UP = 3;
    let sectionEl;
    let avail = $state({ w: 0, h: 0 });

    // Each label's tools hang in a gutter beside the sheet (right, or top when
    // the sheet is turned) rather than over the label. Wide enough for a touch
    // target where the pointer is coarse. The frame reserves it; the scale
    // leaves room for it.
    let coarse = $state(false);
    $effect(() => {
        const mq = window.matchMedia('(pointer: coarse)');
        coarse = mq.matches;
        const on = () => { coarse = mq.matches; };
        mq.addEventListener('change', on);
        return () => mq.removeEventListener('change', on);
    });
    const gutter = $derived(coarse ? 52 : 40);
    $effect(() => {
        if (!sectionEl) { return; }
        const measure = () => { avail = { w: sectionEl.clientWidth - 2 * PAD, h: sectionEl.clientHeight - 2 * PAD - 24 - barH }; };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(sectionEl);
        return () => ro.disconnect();
    });
    const viewScale = $derived.by(() => {
        if (avail.w <= 0) { return 1; }
        const page = resolvePage(effectivePage(store));
        const turned = clampRotation(store.rotation) === 90;   // footprint turns with the sheet
        const w = (turned ? page.height : page.width) * PX_PER_MM;
        const h = (turned ? page.width : page.height) * PX_PER_MM;
        const availW = avail.w - (turned ? 0 : gutter);
        const availH = avail.h - (turned ? gutter : 0);
        const up = Math.max(1, Math.min(COMFORT_W / w, availH / h, MAX_UP));
        return Math.max(0.2, Math.min(availW / w, up));
    });

    // --- turn button ---
    // The same choice as the panel's Label shape, where the eye already is. It
    // is named for its result ("Make labels tall"), which is the shape the
    // labels would become, so it can never be misread as rotating the paper.
    const turnTo = $derived.by(() => {
        const next = clampRotation(store.rotation) === 90 ? 0 : 90;
        const page = effectivePage(store);
        const now = labelShape(resolveContent(page, store.divisions, store.margin, store.gap, store.rotation));
        const then = labelShape(resolveContent(page, store.divisions, store.margin, store.gap, next));
        return { rotation: next, label: then === now ? 'Turn labels' : `Make labels ${then}` };
    });
    let barH = $state(0);

    // --- accept presets dragged from the Presets drawer ---
    let dropActive = $state(false);
    const PRESET_TYPE = 'application/x-label-preset';
    const isPresetDrag = (e) => e.dataTransfer && [...e.dataTransfer.types].includes(PRESET_TYPE);

    // Where a drop should insert: before the first segment whose midpoint is past
    // the cursor. The axis is orientation-dependent on screen (insertionIndex).
    function dropIndex(list, event) {
        return insertionIndex([...list.querySelectorAll('.text-container')], event);
    }

    function onDragOver(event) {
        if (!isPresetDrag(event)) { return; }
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        dropActive = true;
    }
    function onDragLeave(event) {
        if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget)) { dropActive = false; }
    }
    function onDrop(event) {
        if (!isPresetDrag(event)) { return; }
        event.preventDefault();
        dropActive = false;
        const id = event.dataTransfer.getData(PRESET_TYPE);
        if (!id) { return; }
        const list = event.currentTarget.querySelector('#labelList');
        insertPreset(id, list ? dropIndex(list, event) : undefined);
    }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<main
    bind:this={sectionEl}
    id="labels-section"
    class:preset-drop-active={dropActive}
    ondragover={onDragOver}
    ondragleave={onDragLeave}
    ondrop={onDrop}
>
    <!-- Sticky, so it stays in reach through a long run of pages. Hidden in
         print by app.css's print list. -->
    <div class="sheet-bar" bind:offsetHeight={barH}>
        <button type="button" id="turn-labels" class="btn" onclick={() => (store.rotation = turnTo.rotation)}>
            <svg class="size-[1.05em] shrink-0 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true"><path d="M463.5 224H472c13.3 0 24-10.7 24-24V72c0-9.7-5.8-18.5-14.8-22.2s-19.3-1.7-26.2 5.2L413.4 96.6c-87.6-86.5-228.7-86.2-315.8 1c-87.5 87.5-87.5 229.3 0 316.8s229.3 87.5 316.8 0c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0c-62.5 62.5-163.8 62.5-226.3 0s-62.5-163.8 0-226.3c62.2-62.2 162.7-62.5 225.3-1L327 183c-6.9 6.9-8.9 17.2-5.2 26.2s12.5 14.8 22.2 14.8H463.5z" /></svg>
            {turnTo.label}
        </button>
    </div>

    <div id="labelList" class="printable" style:--view-scale={viewScale} style:--tool-gutter="{gutter}px">
        {#each pages as page, pi (pi)}
            <!-- The frame holds the sheet's on-screen footprint: its true size
                 times the view scale, turned when the artwork is (so artwork is
                 edited upright). A transform alone would leave the layout at the
                 untransformed size — see .page-frame in app.css. Inert in print. -->
            <div class="page-frame">
                <ul class="print-page">
                    {#each page as label (label.id)}
                        <Label {label} />
                    {/each}
                </ul>
                <!-- A blank sheet says what to do next. Outside the sheet's
                     transform so it is never scaled or turned. Hidden in print
                     by app.css's print list, not a print: utility, which the
                     unlayered .empty-hint rule would outrank. -->
                {#if store.labels.length === 0}
                    <div class="empty-hint">
                        <p class="m-0 text-[1rem] font-bold">No labels yet</p>
                        <p class="m-0 text-[0.85rem] leading-[1.45] text-ink/70">Type in the box above and press Enter. Put a number in Qty to make several at once.</p>
                        <div class="mt-1 flex flex-wrap justify-center gap-2">
                            <button type="button" class="btn" onclick={openImport}>Import a list</button>
                            <button type="button" class="btn" onclick={() => openPresets()}>Use a preset</button>
                        </div>
                    </div>
                {/if}
            </div>
        {/each}
    </div>
</main>
