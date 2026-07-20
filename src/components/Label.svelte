<script>
    import { store, duplicateLabel, deleteLabel, setImage, removeImage, savePresetFromLabel, patchAdjust, moveLabel } from '../lib/store.svelte.js';
    import { adjustStyle, effectiveLayout, isSideRight } from '../lib/adjust.js';
    import { fileToLabelImage } from '../lib/image.js';
    import { openAdjust, openPresets } from '../lib/ui.svelte.js';
    import { draggable } from '../actions/draggable.js';
    import { resizable } from '../actions/resizable.js';
    import LabelCanvas from './LabelCanvas.svelte';

    let { label } = $props();

    let fileInput;

    const hasImage = $derived(!!label.image);
    const layout = $derived(effectiveLayout(label.adjust, hasImage));
    const sideRight = $derived(isSideRight(label.adjust, hasImage));

    function onImageTool() {
        if (label.image) { openAdjust(label.id); }
        else { fileInput.click(); }
    }

    function onPickImage(event) {
        const file = event.target.files[0];
        event.target.value = '';
        if (!file) { return; }
        const hadImage = !!label.image;
        fileToLabelImage(file)
            .then((src) => { setImage(label.id, src); if (!hadImage) { openAdjust(label.id); } })
            .catch(() => { /* not an image - ignore */ });
    }

    function onSavePreset() {
        const name = window.prompt('Name this preset:', label.text || 'Label preset');
        if (name === null) { return; }
        savePresetFromLabel(label.id, name);
        openPresets();
    }

    const toggleFit = () => patchAdjust(label.id, { fit: label.adjust.fit === 'cover' ? 'contain' : 'cover' });
    const toggleLayout = () => patchAdjust(label.id, { layout: label.adjust.layout === 'fill' ? 'beside' : 'fill' });
    const toggleSide = () => patchAdjust(label.id, { side: label.adjust.side === 'right' ? 'left' : 'right' });

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
    class="text-container"
    class:landscape={store.orientation === 'landscape'}
    class:layout-beside={layout === 'beside'}
    class:layout-fill={layout === 'fill'}
    class:side-right={sideRight}
    style={adjustStyle(label.adjust)}
    data-id={label.id}
>
    <LabelCanvas
        editable
        id={label.id}
        image={label.image}
        bind:text={label.text}
        adjust={label.adjust}
        onImageClick={() => openAdjust(label.id)}
    />

    {#if label.image && layout === 'beside'}
        <div class="label-resize-handle" use:resizable={{ id: label.id, getSide: () => label.adjust.side }}></div>
    {/if}

    {#if label.image}
        <button type="button" class="label-image-remove" title="Remove image" aria-label="Remove image" onclick={() => removeImage(label.id)}>&times;</button>
    {/if}

    <div class="label-tools">
        <button type="button" class="tool-drag" title="Drag to reorder" aria-label="Drag to reorder" use:draggable={{ id: label.id }} onkeydown={onDragKey}>&#10495;</button>
        <button type="button" class="tool-image" title="Add, replace or adjust image" aria-label="Add, replace or adjust image" onclick={onImageTool}>&#128247;</button>
        {#if label.image}
            <button type="button" class="tool-fit" title="Toggle fit / fill" aria-label="Toggle fit or fill" onclick={toggleFit}>&#9635;</button>
            <button type="button" class="tool-layout" title="Toggle beside / fill layout" aria-label="Toggle beside or fill layout" onclick={toggleLayout}>&#9707;</button>
            {#if layout === 'beside'}
                <button type="button" class="tool-side" title="Swap image side" aria-label="Swap image side" onclick={toggleSide}>&#8646;</button>
            {/if}
        {/if}
        <button type="button" class="tool-preset" title="Save as preset" aria-label="Save as preset" onclick={onSavePreset}>&#9733;</button>
        <button type="button" class="tool-duplicate" title="Duplicate label" aria-label="Duplicate label" onclick={() => duplicateLabel(label.id)}>&#10697;</button>
        <button type="button" class="tool-delete" title="Delete label" aria-label="Delete label" onclick={() => deleteLabel(label.id)}>&times;</button>
    </div>

    <input type="file" bind:this={fileInput} accept="image/*" hidden onchange={onPickImage} />
</li>
