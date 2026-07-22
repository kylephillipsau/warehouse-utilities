<script>
    import { ui } from '../lib/ui.svelte.js';
    import { store, insertPreset, renamePreset, deletePreset } from '../lib/store.svelte.js';
    import { resolveTemplate } from '../lib/tokens.js';
    import Drawer from './Drawer.svelte';

    function close() { ui.presetsOpen = false; }

    // Inline rename — no browser prompt. The name becomes a text field that
    // commits on Enter/blur and cancels on Escape.
    let editingId = $state(null);
    let editValue = $state('');
    function startRename(preset) { editingId = preset.id; editValue = preset.name; }
    function commitRename() {
        if (editingId == null) { return; }
        renamePreset(editingId, editValue);
        editingId = null;
    }
    function cancelRename() { editingId = null; }

    // A just-saved preset asks to be renamed immediately (see openPresets)
    $effect(() => {
        if (ui.presetsEditId == null) { return; }
        const preset = store.presets.find((x) => x.id === ui.presetsEditId);
        if (preset) { editingId = preset.id; editValue = preset.name; }
        ui.presetsEditId = null;
    });

    function onRenameKey(event) {
        if (event.key === 'Enter') { event.preventDefault(); commitRename(); }
        else if (event.key === 'Escape') { event.preventDefault(); cancelRename(); }
    }
    // Focus + select the field as soon as it appears
    function focusField(node) { node.focus(); node.select(); }

    // Start a drag that the label sheet accepts (see LabelList). A custom type
    // keeps it distinct from file drags so the import handler ignores it.
    function onDragStart(event, preset) {
        event.dataTransfer.setData('application/x-label-preset', String(preset.id));
        event.dataTransfer.effectAllowed = 'copy';
    }
</script>

<Drawer open={ui.presetsOpen} title="Preset labels" onClose={close}>
    {#if store.presets.length === 0}
        <p id="presets-empty" class="m-0 text-[0.9rem] leading-[1.4]">No saved presets yet. Use a label's &#9733; button, or Save as preset in the image editor, to build your library.</p>
    {:else}
        <p class="m-0 text-[0.85rem] leading-[1.4] text-ink/70">Drag a preset onto the sheet to place it, or use Insert.</p>
    {/if}
    <div id="presets-list" class="flex flex-col gap-2">
        {#each store.presets as preset (preset.id)}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
                class="preset-row group flex items-center gap-3 p-2 border-2 border-ink rounded-lg bg-white {editingId === preset.id ? '' : 'cursor-grab active:cursor-grabbing'}"
                draggable={editingId !== preset.id}
                ondragstart={(e) => onDragStart(e, preset)}
                title={editingId === preset.id ? '' : 'Drag onto the sheet to place'}
            >
                <span class="shrink-0 text-ink/40 select-none" aria-hidden="true">&#10495;</span>
                <div class="preset-thumb flex-none w-14 h-10 flex flex-col items-stretch justify-center overflow-hidden border border-ink/35 rounded font-bold text-ink leading-none">
                    {#if preset.fields && preset.fields.length}
                        {#each preset.fields.slice(0, 3) as f}
                            <span class="block truncate px-[2px] text-center text-[6px]">{resolveTemplate(f.value) || '—'}</span>
                        {/each}
                    {:else if preset.image}
                        <img src={preset.image} alt="" class="w-full h-full object-contain pointer-events-none" />
                    {:else}
                        <span class="text-center">Aa</span>
                    {/if}
                </div>
                {#if editingId === preset.id}
                    <input
                        type="text"
                        class="min-w-0 flex-1 !py-1 text-[0.9rem] font-bold"
                        bind:value={editValue}
                        onkeydown={onRenameKey}
                        onblur={commitRename}
                        aria-label="Preset name"
                        use:focusField
                    />
                    <button type="button" class="label-tool !bg-purple !text-paper !border-purple" title="Save name" aria-label="Save name" onmousedown={(e) => e.preventDefault()} onclick={commitRename}>&#10003;</button>
                {:else}
                    <button type="button" class="flex-1 min-w-0 text-left font-bold overflow-hidden text-ellipsis whitespace-nowrap cursor-text" title="Click to rename" onclick={() => startRename(preset)}>{preset.name}</button>
                    <div class="flex gap-[0.35rem] flex-none">
                        <button type="button" class="btn btn-primary preset-insert px-[0.6rem] py-[0.3rem] text-[0.85rem]" onclick={() => insertPreset(preset.id)}>Insert</button>
                        <button type="button" class="label-tool preset-rename" title="Rename" aria-label="Rename preset" onclick={() => startRename(preset)}>&#9998;</button>
                        <button type="button" class="label-tool preset-delete !text-orange" title="Delete" aria-label="Delete preset" onclick={() => deletePreset(preset.id)}>&times;</button>
                    </div>
                {/if}
            </div>
        {/each}
    </div>
</Drawer>
