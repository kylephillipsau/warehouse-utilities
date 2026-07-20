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

<dialog id="presets-dialog" bind:this={dlg} use:dialogSync={ui.presetsOpen} onclose={() => { ui.presetsOpen = false; }} onclick={onDialogClick}>
    <div id="presets-dialog-body">
        <span class="group-label">Preset labels</span>
        {#if store.presets.length === 0}
            <p id="presets-empty" class="presets-hint">No saved presets yet. Use a label's &#9733; button, or Save as preset in the image editor, to build your library.</p>
        {/if}
        <div id="presets-list">
            {#each store.presets as preset (preset.id)}
                <div class="preset-row">
                    <div class="preset-thumb" class:preset-thumb-text={!preset.image}>
                        {#if preset.image}
                            <img src={preset.image} alt="" />
                        {:else}
                            Aa
                        {/if}
                    </div>
                    <span class="preset-name">{preset.name}</span>
                    <div class="preset-actions">
                        <button type="button" class="btn btn-primary preset-insert" onclick={() => insertPreset(preset.id)}>Insert</button>
                        <button type="button" class="btn preset-rename" onclick={() => onRename(preset)}>Rename</button>
                        <button type="button" class="btn preset-delete" onclick={() => deletePreset(preset.id)}>Delete</button>
                    </div>
                </div>
            {/each}
        </div>
        <div id="presets-close-row">
            <button type="button" class="btn" id="presets-close" onclick={() => { ui.presetsOpen = false; }}>Close</button>
        </div>
    </div>
</dialog>
