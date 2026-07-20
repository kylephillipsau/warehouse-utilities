<script>
    import { ui } from '../lib/ui.svelte.js';
    import { store, insertPreset, renamePreset, deletePreset } from '../lib/store.svelte.js';
    import { dialogSync } from '../actions/dialogSync.js';

    let dlg;

    function onRename(preset) {
        const name = window.prompt('Rename preset:', preset.name);
        if (name === null) { return; }
        renamePreset(preset.id, name);
    }

    function onDialogClick(event) {
        if (event.target === dlg) { ui.presetsOpen = false; }
    }
</script>

<dialog id="presets-dialog" class="dialog dialog-wide" bind:this={dlg} use:dialogSync={ui.presetsOpen} onclose={() => { ui.presetsOpen = false; }} onclick={onDialogClick}>
    <div class="flex flex-col gap-[0.85rem] p-5">
        <span class="group-label">Preset labels</span>
        {#if store.presets.length === 0}
            <p id="presets-empty" class="m-0 text-[0.9rem] leading-[1.4]">No saved presets yet. Use a label's &#9733; button, or Save as preset in the image editor, to build your library.</p>
        {/if}
        <div id="presets-list" class="flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
            {#each store.presets as preset (preset.id)}
                <div class="flex items-center gap-3 p-2 border-2 border-ink rounded-lg bg-white">
                    <div class="preset-thumb flex-none w-14 h-10 flex items-center justify-center overflow-hidden border border-ink/35 rounded font-bold text-ink">
                        {#if preset.image}
                            <img src={preset.image} alt="" class="w-full h-full object-contain" />
                        {:else}
                            Aa
                        {/if}
                    </div>
                    <span class="flex-1 min-w-0 font-bold overflow-hidden text-ellipsis whitespace-nowrap">{preset.name}</span>
                    <div class="flex gap-[0.35rem] flex-none">
                        <button type="button" class="btn btn-primary preset-insert px-[0.6rem] py-[0.3rem] text-[0.85rem]" onclick={() => insertPreset(preset.id)}>Insert</button>
                        <button type="button" class="btn preset-rename px-[0.6rem] py-[0.3rem] text-[0.85rem]" onclick={() => onRename(preset)}>Rename</button>
                        <button type="button" class="btn preset-delete px-[0.6rem] py-[0.3rem] text-[0.85rem]" onclick={() => deletePreset(preset.id)}>Delete</button>
                    </div>
                </div>
            {/each}
        </div>
        <div class="flex justify-end">
            <button type="button" class="btn" id="presets-close" onclick={() => { ui.presetsOpen = false; }}>Close</button>
        </div>
    </div>
</dialog>
