<script>
    import { store, insertPreset } from '../lib/store.svelte.js';
    import { tiling, insertionIndex, resolvePage, clampRotation } from '../lib/size.js';
    import { effectivePage } from '../lib/output.js';
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
    $effect(() => {
        if (!sectionEl) { return; }
        const measure = () => { avail = { w: sectionEl.clientWidth - 2 * PAD, h: sectionEl.clientHeight - 2 * PAD - 24 }; };
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
        const up = Math.max(1, Math.min(COMFORT_W / w, avail.h / h, MAX_UP));
        return Math.max(0.2, Math.min(avail.w / w, up));
    });

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
    <div id="labelList" class="printable" style:--view-scale={viewScale}>
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
            </div>
        {/each}
    </div>
</main>
