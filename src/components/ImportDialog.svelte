<script>
    import { ui, openImport } from '../lib/ui.svelte.js';
    import { store, importLines, addImageLabel } from '../lib/store.svelte.js';
    import { openLabelFile } from '../lib/serialize.js';
    import { fileToLabelImage } from '../lib/image.js';
    import { dialogSync } from '../actions/dialogSync.js';

    const HINT_DEFAULT = 'Paste or type below, one label per line, or drop in a text file.';

    let dlg;
    let value = $state('');
    let hint = $state(HINT_DEFAULT);
    let dragover = $state(false);
    let fileInput;

    const lines = $derived(
        value.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0)
    );
    const submitLabel = $derived(
        lines.length === 0 ? 'Import labels'
            : lines.length === 1 ? 'Import 1 label'
                : `Import ${lines.length} labels`
    );

    function reset() {
        value = '';
        hint = HINT_DEFAULT;
        dragover = false;
    }

    function submit() {
        importLines(lines);
        ui.importOpen = false;
    }

    function readImportFile(file) {
        if (!file) { return; }
        const looksLikeJson = /\.json$/i.test(file.name) || file.type === 'application/json';
        if (looksLikeJson) {
            file.text().then((text) => {
                let data;
                try { data = JSON.parse(text); }
                catch (e) { hint = "That .json file couldn't be read."; return; }
                const res = openLabelFile(data, {
                    confirmReplace: () => window.confirm('Opening this file will replace your current labels. Continue?'),
                });
                if (res.ok) { ui.importOpen = false; }
                else if (res.error) { hint = res.error; }
            });
            return;
        }
        const looksLikeText = (file.type && file.type.startsWith('text/')) || /\.(txt|csv)$/i.test(file.name);
        if (!looksLikeText) {
            hint = "That file doesn't look right. Use a .txt/.csv list or a .json label file.";
            return;
        }
        file.text().then((text) => {
            const existing = value.trim();
            value = existing ? existing + '\n' + text.trim() : text.trim();
            hint = HINT_DEFAULT;
        });
    }

    function onFilePick(event) {
        readImportFile(event.target.files[0]);
        event.target.value = '';
    }

    // Drag & drop a file anywhere on the page opens this dialog and reads it
    function onWindowDragOver(event) { event.preventDefault(); dragover = true; }
    function onWindowDragLeave(event) { if (!event.relatedTarget) { dragover = false; } }
    function onWindowDrop(event) {
        event.preventDefault();
        dragover = false;
        const file = event.dataTransfer && event.dataTransfer.files[0];
        if (!file) { return; }
        // An image dropped on empty sheet space becomes a new image label
        // (drops onto a label are handled there and don't bubble here).
        if (file.type && file.type.startsWith('image/')) {
            fileToLabelImage(file).then((src) => addImageLabel(src)).catch(() => {});
            return;
        }
        if (!ui.importOpen) { openImport(); }
        readImportFile(file);
    }

    function onDialogClick(event) {
        if (event.target === dlg) { ui.importOpen = false; }
    }
</script>

<svelte:window ondragover={onWindowDragOver} ondragleave={onWindowDragLeave} ondrop={onWindowDrop} />

<dialog id="import-dialog" class="dialog" bind:this={dlg} use:dialogSync={ui.importOpen} onclose={() => { ui.importOpen = false; reset(); }} onclick={onDialogClick}>
    <div class="flex flex-col gap-3 p-5">
        <span class="group-label">Import list</span>
        <p class="m-0 text-[0.9rem] leading-[1.4]">{hint}</p>
        <textarea
            id="multiline-input"
            class="font-sans text-[0.95rem] text-ink bg-white w-full box-border min-h-[12rem]
                   resize-y border-2 border-ink rounded-md px-[0.6rem] py-2"
            placeholder={"AISLE 4\nRETURNS BAY\nDISPATCH"}
            bind:value
        ></textarea>
        <button
            type="button"
            id="file-drop"
            class="flex items-center justify-center gap-[0.3rem] w-full box-border p-[0.65rem]
                   text-[0.85rem] text-ink cursor-pointer transition-colors border-2 border-dashed rounded-md
                   {dragover ? 'border-purple bg-purple/[0.08]' : 'border-ink/45 bg-transparent'}"
            onclick={() => fileInput.click()}
        >
            Drag a text file here, or <span class="text-purple font-bold underline">browse</span>
        </button>
        <input type="file" id="import-file" bind:this={fileInput} accept=".txt,.csv,.json,text/plain,application/json" onchange={onFilePick} hidden />
        <div class="flex justify-end gap-2">
            <button type="button" class="btn" onclick={() => { ui.importOpen = false; }}>Cancel</button>
            <button type="button" class="btn btn-primary" disabled={lines.length === 0} onclick={submit}>{submitLabel}</button>
        </div>
    </div>
</dialog>
