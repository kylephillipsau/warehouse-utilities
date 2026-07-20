<script>
    import { store, duplicateLabel, deleteLabel, setImage, removeImage, savePresetFromLabel, patchAdjust, moveLabel } from '../lib/store.svelte.js';
    import { adjustStyle } from '../lib/adjust.js';
    import { fileToLabelImage } from '../lib/image.js';
    import { openAdjust, openPresets } from '../lib/ui.svelte.js';
    import { fitText } from '../actions/fitText.js';
    import { draggable } from '../actions/draggable.js';
    import { panImage } from '../actions/panImage.js';
    import { resizable } from '../actions/resizable.js';

    let { label } = $props();

    let fileInput;

    const hasImage = $derived(!!label.image);
    const layout = $derived(hasImage && label.adjust.layout === 'fill' ? 'fill' : 'beside');
    const sideRight = $derived(hasImage && layout === 'beside' && label.adjust.side === 'right');

    // Anything that changes the fit box; the fitText action re-fits on change
    const fitKey = $derived(
        `${label.text}|${store.size.preset}|${store.size.width}|${store.size.height}|` +
        `${store.orientation}|${hasImage ? 1 : 0}|${label.adjust.split}|${layout}`
    );

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

    function toggleFit() {
        patchAdjust(label.id, { fit: label.adjust.fit === 'cover' ? 'contain' : 'cover' });
    }

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
    <div class="label-content">
        {#if label.image}
            <div class="label-image-frame">
                <img
                    class="label-image"
                    src={label.image}
                    alt=""
                    use:panImage={{ id: label.id, getAdjust: () => label.adjust, onClick: () => openAdjust(label.id) }}
                />
            </div>
        {/if}
        <div class="label-text-area">
            <span class="text" contenteditable="true" bind:textContent={label.text} use:fitText={fitKey}></span>
        </div>
        {#if label.image && layout === 'beside'}
            <div class="label-resize-handle" use:resizable={{ id: label.id, getSide: () => label.adjust.side }}></div>
        {/if}
    </div>

    {#if label.image}
        <button type="button" class="label-image-remove" title="Remove image" aria-label="Remove image" onclick={() => removeImage(label.id)}>&times;</button>
    {/if}

    <div class="label-tools">
        <button type="button" class="tool-drag" title="Drag to reorder" aria-label="Drag to reorder" use:draggable={{ id: label.id }} onkeydown={onDragKey}>&#10495;</button>
        <button type="button" class="tool-image" title="Add, replace or adjust image" aria-label="Add, replace or adjust image" onclick={onImageTool}>&#128247;</button>
        {#if label.image}
            <button type="button" class="tool-fit" title="Toggle fit / fill" aria-label="Toggle fit or fill" onclick={toggleFit}>&#9635;</button>
        {/if}
        <button type="button" class="tool-preset" title="Save as preset" aria-label="Save as preset" onclick={onSavePreset}>&#9733;</button>
        <button type="button" class="tool-duplicate" title="Duplicate label" aria-label="Duplicate label" onclick={() => duplicateLabel(label.id)}>&#10697;</button>
        <button type="button" class="tool-delete" title="Delete label" aria-label="Delete label" onclick={() => deleteLabel(label.id)}>&times;</button>
    </div>

    <input type="file" bind:this={fileInput} accept="image/*" hidden onchange={onPickImage} />
</li>
