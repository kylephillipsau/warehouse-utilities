<script>
    import { ui } from '../lib/ui.svelte.js';
    import { store, labelsHaveImages } from '../lib/store.svelte.js';
    import { serializeLabels, exportTextLines } from '../lib/serialize.js';
    import { buildZpl, ZPL_DPIS } from '../lib/zpl.js';
    import { dialogSync } from '../actions/dialogSync.js';
    import Select from './Select.svelte';

    let dlg;
    let zplDpi = $state(203);
    let zplBusy = $state(false);
    let zplError = $state('');
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

    async function exportZpl() {
        zplError = '';
        if (store.labels.every((l) => !(l.text && l.text.trim()) && !l.image)) {
            zplError = 'Add a label first — there is nothing to print.';
            return;
        }
        zplBusy = true;
        try {
            const { zpl } = await buildZpl(store, Number(zplDpi));
            downloadBlob(new Blob([zpl], { type: 'application/octet-stream' }), 'labels.zpl');
            ui.exportOpen = false;
        } catch (e) {
            zplError = "Couldn't generate ZPL. " + (e && e.message ? e.message : '');
        } finally {
            zplBusy = false;
        }
    }

    function onDialogClick(event) {
        if (event.target === dlg) { ui.exportOpen = false; }
    }
</script>

<dialog id="export-dialog" class="dialog" aria-labelledby="export-title" bind:this={dlg} use:dialogSync={ui.exportOpen} onclose={() => { ui.exportOpen = false; }} onclick={onDialogClick}>
    <div class="flex flex-col gap-3 p-5">
        <span class="group-label" id="export-title">Save labels</span>
        <p class="m-0 text-[0.9rem] leading-[1.4]">
            {#if hasImages}
                Your labels include images - save a label file to keep them. Plain text saves the words only.
            {:else}
                Save a label file to keep images later, or plain text for a simple list.
            {/if}
        </p>
        <div class="flex flex-wrap gap-2">
            <button type="button" class="btn flex-[1_1_12rem]" class:btn-primary={hasImages} id="export-json" onclick={exportJson}>Label file (.json)</button>
            <button type="button" class="btn flex-[1_1_12rem]" class:btn-primary={!hasImages} id="export-text" onclick={exportText}>Plain text (.txt)</button>
        </div>

        <div class="mt-1 flex flex-col gap-2 rounded-lg border-2 border-ink/15 p-3">
            <span class="group-label">Print exact on a Zebra</span>
            <p class="m-0 text-[0.85rem] leading-[1.4] text-ink/80">
                Browser printing can scale labels (Chrome renders at 300&nbsp;dpi). Export <strong>ZPL</strong> to print at the printer's true dot size. Send the <code>.zpl</code> to the printer raw (a "Generic / Text Only" queue, or copy it to the printer share).
            </p>
            <div class="flex flex-wrap items-center gap-2">
                <button type="button" class="btn btn-primary flex-[1_1_12rem]" id="export-zpl" disabled={zplBusy} onclick={exportZpl}>
                    {zplBusy ? 'Generating…' : 'Zebra ZPL (.zpl)'}
                </button>
                <label class="flex items-center gap-2 text-[0.85rem]">
                    <span class="whitespace-nowrap">Printer</span>
                    <Select ariaLabel="Printer resolution" class="w-[15rem] max-w-full" options={ZPL_DPIS.map((d) => ({ value: d.value, label: d.label }))} bind:value={zplDpi} />
                </label>
            </div>
            {#if zplError}
                <p class="m-0 text-[0.85rem] font-bold text-orange" role="alert">{zplError}</p>
            {/if}
        </div>

        <div class="flex justify-end">
            <button type="button" class="btn" onclick={() => { ui.exportOpen = false; }}>Cancel</button>
        </div>
    </div>
</dialog>
