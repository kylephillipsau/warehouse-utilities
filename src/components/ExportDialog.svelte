<script>
    import { ui } from '../lib/ui.svelte.js';
    import { labelsHaveImages } from '../lib/store.svelte.js';
    import { serializeLabels, exportTextLines } from '../lib/serialize.js';
    import { dialogSync } from '../actions/dialogSync.js';

    let dlg;
    const hasImages = $derived(ui.exportOpen && labelsHaveImages());

    function downloadBlob(blob, filename) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    function exportJson() {
        const blob = new Blob([JSON.stringify(serializeLabels(), null, 2)], { type: 'application/json' });
        downloadBlob(blob, 'labels.json');
        ui.exportOpen = false;
    }

    function exportText() {
        const blob = new Blob([exportTextLines().join('\n')], { type: 'text/plain' });
        downloadBlob(blob, 'labels.txt');
        ui.exportOpen = false;
    }

    function onDialogClick(event) {
        if (event.target === dlg) { ui.exportOpen = false; }
    }
</script>

<dialog id="export-dialog" bind:this={dlg} use:dialogSync={ui.exportOpen} onclose={() => { ui.exportOpen = false; }} onclick={onDialogClick}>
    <div id="export-dialog-body">
        <span class="group-label">Save labels</span>
        <p id="export-hint">
            {#if hasImages}
                Your labels include images - save a label file to keep them. Plain text saves the words only.
            {:else}
                Save a label file to keep images later, or plain text for a simple list.
            {/if}
        </p>
        <div id="export-actions">
            <button type="button" class="btn" class:btn-primary={hasImages} id="export-json" onclick={exportJson}>Label file (.json)</button>
            <button type="button" class="btn" class:btn-primary={!hasImages} id="export-text" onclick={exportText}>Plain text (.txt)</button>
        </div>
        <div id="export-close-row">
            <button type="button" class="btn" onclick={() => { ui.exportOpen = false; }}>Cancel</button>
        </div>
    </div>
</dialog>
