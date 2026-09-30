<script>
    import { ui } from '../lib/ui.svelte.js';
    import { store, insertPreset, renamePreset, deletePreset } from '../lib/store.svelte.js';
    import { resolveTemplate } from '../lib/tokens.js';
    import { resolveContent } from '../lib/size.js';
    import { effectivePage } from '../lib/output.js';
    import Drawer from './Drawer.svelte';
    import LabelMenu from './LabelMenu.svelte';
    import LabelThumb from './LabelThumb.svelte';

    function close() { ui.presetsOpen = false; }

    // ---- The shelf ----
    // Every preset is drawn by the real renderer at the size a label has on
    // the current sheet, so a preview is exactly what adding it produces.
    // The name goes wherever the label leaves room:
    //   wide     under it, one per row at the drawer's full width, where the
    //            label's text is still legible;
    //   squarish under it, two per row;
    //   tall     BESIDE it, one per row: a tall label leaves the width free
    //            and would strand its name under a sliver of paper.
    const content = $derived(resolveContent(effectivePage(store), store.divisions, store.margin, store.gap, store.rotation));
    const aspect = $derived(content.width / content.height);
    const layout = $derived(aspect <= 0.62 ? 'row' : 'stack');
    const cols = $derived(layout === 'row' || aspect >= 1.6 ? 1 : 2);
    const MAX_THUMB_H = 200;   // stacked; a squarish label fills its column
    const MAX_ROW_THUMB_H = 160;
    const ROW_THUMB_H = 96;    // a tall label's height in a row
    const ROW_THUMB_MIN_W = 26;
    const GAP = 14;   // px, matches .preset-shelf's column gap
    let shelfW = $state(0);
    const colW = $derived(Math.max(0, (shelfW - GAP * (cols - 1)) / cols));
    // The thumbnail box is the label's own footprint. In a row it is a fixed
    // height, grown only as far as keeps a very thin label wide enough to see.
    const thumbH = $derived(layout === 'row'
        ? Math.min(MAX_ROW_THUMB_H, Math.max(ROW_THUMB_H, ROW_THUMB_MIN_W / aspect))
        : Math.min(colW / aspect, MAX_THUMB_H));
    const thumbW = $derived(thumbH * aspect);

    // ---- Finding one ----
    // Only once the shelf is long enough to need it. Matches the name and the
    // text on the label, since people remember either.
    const FILTER_FROM = 7;
    let query = $state('');
    const presetText = (p) => (p.fields && p.fields.length
        ? p.fields.map((f) => resolveTemplate(f.value)).join(' ')
        : (p.text || ''));
    const shown = $derived.by(() => {
        const q = query.trim().toLowerCase();
        if (!q) { return store.presets; }
        return store.presets.filter((p) => (p.name + ' ' + presetText(p)).toLowerCase().includes(q));
    });

    // ---- Adding ----
    // The whole preview is the button. On a phone the drawer covers the
    // sheet, so the preset itself confirms the add for a moment.
    let addedId = $state(null);
    let addedTimer;
    function add(preset) {
        insertPreset(preset.id);
        addedId = preset.id;
        clearTimeout(addedTimer);
        addedTimer = setTimeout(() => { addedId = null; }, 1400);
    }

    // Start a drag that the label sheet accepts (see LabelList). A custom type
    // keeps it distinct from file drags so the import handler ignores it.
    function onDragStart(event, preset) {
        event.dataTransfer.setData('application/x-label-preset', String(preset.id));
        event.dataTransfer.effectAllowed = 'copy';
    }

    // ---- Renaming ----
    // Inline, no browser prompt: the name becomes a text field that commits on
    // Enter or blur and cancels on Escape.
    let editingId = $state(null);
    let editValue = $state('');
    function startRename(preset) { editingId = preset.id; editValue = preset.name; }
    function commitRename() {
        if (editingId == null) { return; }
        renamePreset(editingId, editValue);
        editingId = null;
    }
    function cancelRename() { editingId = null; }
    function onRenameKey(event) {
        if (event.key === 'Enter') { event.preventDefault(); commitRename(); }
        else if (event.key === 'Escape') { event.preventDefault(); cancelRename(); }
    }
    function focusField(node) { node.focus(); node.select(); }

    // A just-saved preset asks to be renamed immediately (see openPresets).
    $effect(() => {
        if (ui.presetsEditId == null) { return; }
        const preset = store.presets.find((x) => x.id === ui.presetsEditId);
        if (preset) { query = ''; editingId = preset.id; editValue = preset.name; }
        ui.presetsEditId = null;
    });

    const menuFor = (preset) => [
        { label: 'Add to sheet', action: () => add(preset) },
        { label: 'Rename', action: () => startRename(preset) },
        { label: 'Delete', action: () => deletePreset(preset.id), danger: true },
    ];
</script>

<Drawer open={ui.presetsOpen} title="Presets" onClose={close} widthClass="w-[min(24rem,calc(100vw-2.5rem))]">
    {#if store.presets.length === 0}
        <div id="presets-empty" class="flex flex-col gap-2 text-[0.9rem] leading-[1.45]">
            <p class="m-0 font-bold">No presets yet</p>
            <p class="m-0 text-ink/75">A preset is a label you use often, saved so it is one tap away. To save one, open any label's <strong>⋯</strong> menu and choose <strong>Save as preset</strong>.</p>
        </div>
    {:else}
        <p class="m-0 text-[0.85rem] leading-[1.45] text-ink/70">
            <span class="pointer-coarse:hidden">Click a preset to add it to the end of the sheet, or drag it to a spot.</span>
            <span class="hidden pointer-coarse:inline">Tap a preset to add it to the end of the sheet.</span>
        </p>

        {#if store.presets.length >= FILTER_FROM}
            <input type="search" class="preset-search w-full" placeholder="Find a preset" aria-label="Find a preset" bind:value={query} />
        {/if}

        {#if shown.length === 0}
            <p class="m-0 text-[0.85rem] text-ink/70">No preset matches “{query.trim()}”.</p>
        {/if}

        <ul id="presets-list" class="preset-shelf" data-layout={layout} style:--shelf-cols={cols} style:--shelf-gap="{GAP}px" style:--thumb-h="{thumbH}px" style:--thumb-w="{thumbW}px" bind:clientWidth={shelfW}>
            {#each shown as preset (preset.id)}
                <li class="preset" class:preset-added={addedId === preset.id}>
                    {#if editingId === preset.id}
                        <!-- Renaming: the preview stays put, the name becomes a field. -->
                        <span class="preset-face">
                            <LabelThumb width={content.width} height={content.height} label={preset} boxW={thumbW} boxH={thumbH} />
                        </span>
                        <input
                            type="text"
                            class="preset-rename w-full"
                            bind:value={editValue}
                            onkeydown={onRenameKey}
                            onblur={commitRename}
                            aria-label="Preset name"
                            use:focusField
                        />
                    {:else}
                        <button
                            type="button"
                            class="preset-add"
                            draggable="true"
                            ondragstart={(e) => onDragStart(e, preset)}
                            onclick={() => add(preset)}
                            aria-label={`Add ${preset.name} to the sheet`}
                        >
                            <span class="preset-face">
                                <LabelThumb width={content.width} height={content.height} label={preset} boxW={thumbW} boxH={thumbH} />
                            </span>
                            <!-- The confirmation takes the name's place for a moment,
                                 so it fits any shape and nothing moves. -->
                            <span class="preset-caption">
                                <span class="preset-name">{preset.name}</span>
                                <span class="preset-added-note" aria-hidden="true">&#10003; Added to sheet</span>
                            </span>
                        </button>
                        <span class="preset-menu">
                            <LabelMenu items={menuFor(preset)} />
                        </span>
                    {/if}
                </li>
            {/each}
        </ul>
        <p class="sr-only" role="status">{addedId ? 'Added to the sheet' : ''}</p>
    {/if}
</Drawer>
