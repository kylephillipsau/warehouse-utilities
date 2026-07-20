<script>
    import { ui, openImport } from '../lib/ui.svelte.js';
    import { importLines, addImageLabel } from '../lib/store.svelte.js';
    import { openLabelFile } from '../lib/serialize.js';
    import { fileToLabelImage } from '../lib/image.js';
    import Drawer from './Drawer.svelte';

    const HINT_DEFAULT = 'Paste or type below, one label per line, or drop in a text file.';

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

    function close() { ui.importOpen = false; }

    function submit() {
        importLines(lines);
        value = '';
        hint = HINT_DEFAULT;
        close();
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
                if (res.ok) { close(); }
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

    // A drag carrying files (not an in-app preset drag) is treated as an import.
    const hasFiles = (event) => event.dataTransfer && [...event.dataTransfer.types].includes('Files');
    function onWindowDragOver(event) { if (!hasFiles(event)) { return; } event.preventDefault(); dragover = true; }
    function onWindowDragLeave(event) { if (!event.relatedTarget) { dragover = false; } }
    function onWindowDrop(event) {
        if (!hasFiles(event)) { return; }
        event.preventDefault();
        dragover = false;
        const file = event.dataTransfer.files[0];
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
</script>

<svelte:window ondragover={onWindowDragOver} ondragleave={onWindowDragLeave} ondrop={onWindowDrop} />

<Drawer open={ui.importOpen} title="Import list" onClose={close}>
    <p class="m-0 text-[0.9rem] leading-[1.4]">{hint}</p>
    <textarea
        id="multiline-input"
        class="font-sans text-[0.95rem] text-ink bg-white w-full box-border min-h-[14rem] flex-1
               resize-none border-2 border-ink rounded-md px-[0.6rem] py-2"
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
    <button type="button" class="btn btn-primary w-full" disabled={lines.length === 0} onclick={submit}>{submitLabel}</button>
</Drawer>
