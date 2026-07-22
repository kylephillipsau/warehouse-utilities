<script>
    import { store, duplicateLabel, deleteLabel, setImage, removeImage, savePresetFromLabel, pruneIfEmpty, moveLabel, convertToTemplate, convertToBarcode, patchAdjust } from '../lib/store.svelte.js';
    import { adjustStyle } from '../lib/adjust.js';
    import { fileToLabelImage } from '../lib/image.js';
    import { openAdjust, openPresets, openFields } from '../lib/ui.svelte.js';
    import { draggable } from '../actions/draggable.js';
    import LabelCanvas from './LabelCanvas.svelte';
    import FieldsLabel from './FieldsLabel.svelte';
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
        dragOver = false; // clear the highlight for every drop, image or not
        const file = event.dataTransfer && event.dataTransfer.files[0];
        if (!file || !file.type.startsWith('image/')) { return; }
        event.preventDefault();
        event.stopPropagation();
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
        // Don't prune when focus is only moving to this label's own tools (drag
        // handle, edit, ⋯ menu) — otherwise an empty label would delete itself
        // out from under the action the user just clicked.
        if (li && event.relatedTarget && li.contains(event.relatedTarget)) { return; }
        if (event.target.classList && event.target.classList.contains('text')) {
            if (!label.text || label.text.trim().length === 0) { captionOpen = false; }
            pruneIfEmpty(label.id);
        }
    }

    function savePreset() {
        // Save straight away with a sensible default name, then open Presets with
        // its name focused for inline renaming — no browser prompt.
        const presetId = savePresetFromLabel(label.id);
        openPresets(presetId);
    }

    // Progressive-disclosure actions menu (labeled, not cryptic icons)
    const isTemplate = $derived(!!(label.fields && label.fields.length));
    const menuItems = $derived([
        isTemplate
            ? { label: 'Edit fields', action: () => openFields(label.id) }
            : (label.image
                ? { label: label.text ? 'Edit caption' : 'Add caption', action: addCaption }
                : { label: 'Add image', action: pickImage }),
        !isTemplate && !label.image ? { label: 'Make it a template', action: () => { convertToTemplate(label.id); openFields(label.id); } } : null,
        !isTemplate && !label.image ? { label: 'Make it a barcode', action: () => { convertToBarcode(label.id); openFields(label.id); } } : null,
        { label: 'Duplicate', action: () => duplicateLabel(label.id) },
        { label: 'Save as preset…', action: savePreset },
        label.image && !isTemplate ? { label: 'Remove image', action: () => removeImage(label.id) } : null,
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
    class:drag-over={dragOver}
    style={adjustStyle(label.adjust)}
    data-id={label.id}
    ondragover={onDragOver}
    ondragleave={() => (dragOver = false)}
    ondrop={onDrop}
    onfocusout={onFocusOut}
>
    {#if isTemplate}
        <FieldsLabel {label} editable />
    {:else}
        <LabelCanvas
            editable
            image={label.image}
            bind:text={label.text}
            adjust={label.adjust}
            showCaption={captionOpen}
            onImageClick={() => openAdjust(label.id)}
            onAdjust={(partial) => patchAdjust(label.id, partial)}
        />
    {/if}

    <div class="label-tools">
        <button type="button" class="label-tool tool-drag" title="Drag to reorder" aria-label="Drag to reorder" use:draggable={{ id: label.id }} onkeydown={onDragKey}>&#10495;</button>
        {#if label.image}
            <button type="button" class="label-tool tool-edit" title="Edit image" aria-label="Edit image" onclick={() => openAdjust(label.id)}>&#9998;</button>
        {/if}
        <LabelMenu items={menuItems} />
    </div>

    <input type="file" bind:this={fileInput} accept="image/*" hidden onchange={onPickImage} />
</li>
