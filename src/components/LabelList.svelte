<script>
    import { store, insertPreset } from '../lib/store.svelte.js';
    import { tiling } from '../lib/size.js';
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

    // --- accept presets dragged from the Presets drawer ---
    let dropActive = $state(false);
    const PRESET_TYPE = 'application/x-label-preset';
    const isPresetDrag = (e) => e.dataTransfer && [...e.dataTransfer.types].includes(PRESET_TYPE);

    // Where a drop at clientY should insert: before the first segment whose
    // vertical midpoint is below the cursor, else at the end.
    function dropIndex(list, clientY) {
        const segs = [...list.querySelectorAll('.text-container')];
        for (let i = 0; i < segs.length; i++) {
            const r = segs[i].getBoundingClientRect();
            if (clientY < r.top + r.height / 2) { return i; }
        }
        return segs.length;
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
        insertPreset(id, list ? dropIndex(list, event.clientY) : undefined);
    }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<main
    id="labels-section"
    class:preset-drop-active={dropActive}
    ondragover={onDragOver}
    ondragleave={onDragLeave}
    ondrop={onDrop}
>
    <div id="labelList" class="printable">
        {#each pages as page, pi (pi)}
            <ul class="print-page">
                {#each page as label (label.id)}
                    <Label {label} />
                {/each}
            </ul>
        {/each}
    </div>
</main>
