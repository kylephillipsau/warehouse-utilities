<script>
    import { store, insertPreset } from '../lib/store.svelte.js';
    import { tiling, insertionIndex } from '../lib/size.js';
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
    id="labels-section"
    class:preset-drop-active={dropActive}
    ondragover={onDragOver}
    ondragleave={onDragLeave}
    ondrop={onDrop}
>
    <div id="labelList" class="printable">
        {#each pages as page, pi (pi)}
            <!-- The frame holds the sheet's on-screen footprint. At artwork
                 rotation 90 the sheet is turned -90° inside it so artwork is
                 edited upright, and a transform alone would leave the layout at
                 the unturned size — see .page-frame in app.css. Inert otherwise
                 and in print. -->
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
