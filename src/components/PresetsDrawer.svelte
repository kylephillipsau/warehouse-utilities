<script>
    import { ui } from '../lib/ui.svelte.js';
    import { store, insertPreset, renamePreset, deletePreset } from '../lib/store.svelte.js';
    import Drawer from './Drawer.svelte';

    function close() { ui.presetsOpen = false; }

    function onRename(preset) {
        const name = window.prompt('Rename preset:', preset.name);
        if (name === null) { return; }
        renamePreset(preset.id, name);
    }

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
                class="preset-row group flex items-center gap-3 p-2 border-2 border-ink rounded-lg bg-white cursor-grab active:cursor-grabbing"
                draggable="true"
                ondragstart={(e) => onDragStart(e, preset)}
                title="Drag onto the sheet to place"
            >
                <span class="shrink-0 text-ink/40 select-none" aria-hidden="true">&#10495;</span>
                <div class="preset-thumb flex-none w-14 h-10 flex items-center justify-center overflow-hidden border border-ink/35 rounded font-bold text-ink">
                    {#if preset.image}
                        <img src={preset.image} alt="" class="w-full h-full object-contain pointer-events-none" />
                    {:else}
                        Aa
                    {/if}
                </div>
                <span class="flex-1 min-w-0 font-bold overflow-hidden text-ellipsis whitespace-nowrap">{preset.name}</span>
                <div class="flex gap-[0.35rem] flex-none">
                    <button type="button" class="btn btn-primary preset-insert px-[0.6rem] py-[0.3rem] text-[0.85rem]" onclick={() => insertPreset(preset.id)}>Insert</button>
                    <button type="button" class="label-tool preset-rename" title="Rename" aria-label="Rename preset" onclick={() => onRename(preset)}>&#9998;</button>
                    <button type="button" class="label-tool preset-delete !text-orange" title="Delete" aria-label="Delete preset" onclick={() => deletePreset(preset.id)}>&times;</button>
                </div>
            </div>
        {/each}
    </div>
</Drawer>
