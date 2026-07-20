<script>
    import { store, duplicateLabel, deleteLabel, setImage, removeImage, savePresetFromLabel, pruneIfEmpty, moveLabel } from '../lib/store.svelte.js';
    import { adjustStyle } from '../lib/adjust.js';
    import { fileToLabelImage } from '../lib/image.js';
    import { openAdjust, openPresets } from '../lib/ui.svelte.js';
    import { draggable } from '../actions/draggable.js';
    import LabelCanvas from './LabelCanvas.svelte';
    import LabelMenu from './LabelMenu.svelte';

    let { label } = $props();

    let li;
    let fileInput;
    let captionOpen = $state(false);
    let dragOver = $state(false);

    // --- adding / replacing an image ---
    function pickImage() { fileInput.click(); }
    function onPickImage(event) {
        const file = event.target.files[0];
        event.target.value = '';
        if (!file) { return; }
        fileToLabelImage(file)
            .then((src) => { setImage(label.id, src); openAdjust(label.id); })
            .catch(() => { /* not an image */ });
    }

    // --- drop an image straight onto the label ---
    function onDragOver(event) {
        if (event.dataTransfer && [...event.dataTransfer.items].some((i) => i.kind === 'file')) {
            event.preventDefault();
            dragOver = true;
        }
    }
    function onDrop(event) {
        const file = event.dataTransfer && event.dataTransfer.files[0];
        if (!file || !file.type.startsWith('image/')) { return; }
        event.preventDefault();
        event.stopPropagation();
        dragOver = false;
        fileToLabelImage(file).then((src) => setImage(label.id, src)).catch(() => {});
    }

    // --- caption (opt-in text on an image label) ---
    function addCaption() {
        captionOpen = true;
        queueMicrotask(() => {
            const el = li && li.querySelector('.label-caption .text');
            if (el) { el.focus(); }
        });
    }
    function onFocusOut(event) {
        if (event.target.classList && event.target.classList.contains('text')) {
            if (!label.text || label.text.trim().length === 0) { captionOpen = false; }
            pruneIfEmpty(label.id);
        }
    }

    function savePreset() {
        const name = window.prompt('Name this preset:', label.text || 'Label preset');
        if (name === null) { return; }
        savePresetFromLabel(label.id, name);
        openPresets();
    }

    // Progressive-disclosure actions menu (labeled, not cryptic icons)
    const menuItems = $derived([
        label.image ? { label: label.text ? 'Edit caption' : 'Add caption', action: addCaption } : { label: 'Add image', action: pickImage },
        { label: 'Duplicate', action: () => duplicateLabel(label.id) },
        { label: 'Save as preset…', action: savePreset },
        label.image ? { label: 'Remove image', action: () => removeImage(label.id) } : null,
        { label: 'Delete', action: () => deleteLabel(label.id), danger: true },
    ].filter(Boolean));

    // Keyboard reordering on the drag handle (parity with the original)
    function onDragKey(event) {
        const i = store.labels.findIndex((l) => l.id === label.id);
        if (event.key === 'ArrowUp' && i > 0) {
            moveLabel(label.id, i - 1); event.preventDefault();
            queueMicrotask(() => event.target.focus());
        } else if (event.key === 'ArrowDown' && i < store.labels.length - 1) {
            moveLabel(label.id, i + 1); event.preventDefault();
            queueMicrotask(() => event.target.focus());
        }
    }
</script>

<li
    bind:this={li}
    class="text-container"
    class:landscape={store.orientation === 'landscape'}
    class:drag-over={dragOver}
    style={adjustStyle(label.adjust)}
    data-id={label.id}
    ondragover={onDragOver}
    ondragleave={() => (dragOver = false)}
    ondrop={onDrop}
    onfocusout={onFocusOut}
>
    <LabelCanvas
        editable
        image={label.image}
        bind:text={label.text}
        adjust={label.adjust}
        showCaption={captionOpen}
        onImageClick={() => openAdjust(label.id)}
        onAddImage={pickImage}
    />

    <div class="label-tools">
        <button type="button" class="label-tool tool-drag" title="Drag to reorder" aria-label="Drag to reorder" use:draggable={{ id: label.id }} onkeydown={onDragKey}>&#10495;</button>
        {#if label.image}
            <button type="button" class="label-tool tool-edit" title="Edit image" aria-label="Edit image" onclick={() => openAdjust(label.id)}>&#9998;</button>
        {/if}
        <LabelMenu items={menuItems} />
    </div>

    <input type="file" bind:this={fileInput} accept="image/*" hidden onchange={onPickImage} />
</li>
