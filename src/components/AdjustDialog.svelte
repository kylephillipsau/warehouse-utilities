<script>
    import { ui, closeAdjust, openPresets } from '../lib/ui.svelte.js';
    import { store, setAdjust, setImage, removeImage, savePresetFromLabel } from '../lib/store.svelte.js';
    import { DEFAULT_ADJUST, normalizeAdjust, adjustStyle } from '../lib/adjust.js';
    import { fileToLabelImage } from '../lib/image.js';
    import { dialogSync } from '../actions/dialogSync.js';

    const ALIGN = [
        { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 },
        { x: 0, y: 50 }, { x: 50, y: 50 }, { x: 100, y: 50 },
        { x: 0, y: 100 }, { x: 50, y: 100 }, { x: 100, y: 100 },
    ];

    let dlg;
    let replaceInput;
    let previewEl;
    let working = $state(normalizeAdjust(DEFAULT_ADJUST));
    let previewW = $state(340);
    let previewH = $state(200);
    let hint = $state('');
    let lastId = null;

    const label = $derived(store.labels.find((l) => l.id === ui.adjustTargetId));
    const open = $derived(ui.adjustTargetId != null);
    const layout = $derived(working.layout === 'fill' ? 'fill' : 'beside');
    const sideRight = $derived(layout === 'beside' && working.side === 'right');

    // Initialise the working copy + preview size whenever a new label is opened
    $effect(() => {
        const id = ui.adjustTargetId;
        if (id === lastId) { return; }
        lastId = id;
        if (id == null) { return; }
        const l = store.labels.find((x) => x.id === id);
        if (!l) { return; }
        working = normalizeAdjust(l.adjust);
        hint = 'Drag the image to reposition. Fit shows all of it; Fill crops to the label.';
        const el = document.querySelector(`[data-id="${id}"]`);
        const rect = el ? el.getBoundingClientRect() : null;
        const aspect = rect && rect.width && rect.height ? rect.width / rect.height : 100 / 22;
        const maxW = 340, maxH = 240;
        let w = maxW, h = w / aspect;
        if (h > maxH) { h = maxH; w = h * aspect; }
        previewW = Math.round(w);
        previewH = Math.round(h);
    });

    function setZoom(event) {
        const z = parseFloat(event.target.value) / 100;
        working.zoom = Math.min(4, Math.max(1, isNaN(z) ? 1 : z));
    }

    function align(a) { working.posX = a.x; working.posY = a.y; }

    function onPreviewPointerDown(event) {
        event.preventDefault();
        const rect = previewEl.getBoundingClientRect();
        const startX = event.clientX, startY = event.clientY;
        const baseX = working.posX, baseY = working.posY;
        previewEl.setPointerCapture(event.pointerId);
        const move = (ev) => {
            working.posX = Math.min(100, Math.max(0, baseX - (ev.clientX - startX) / rect.width * 100));
            working.posY = Math.min(100, Math.max(0, baseY - (ev.clientY - startY) / rect.height * 100));
        };
        const up = () => {
            previewEl.releasePointerCapture(event.pointerId);
            previewEl.removeEventListener('pointermove', move);
            previewEl.removeEventListener('pointerup', up);
        };
        previewEl.addEventListener('pointermove', move);
        previewEl.addEventListener('pointerup', up);
    }

    function apply() {
        if (label) { setAdjust(label.id, working); }
        closeAdjust();
    }
    function reset() { working = normalizeAdjust(DEFAULT_ADJUST); }
    function remove() { if (label) { removeImage(label.id); } closeAdjust(); }

    function replace() { replaceInput.click(); }
    function onReplacePick(event) {
        const file = event.target.files[0];
        event.target.value = '';
        if (!file || !label) { return; }
        fileToLabelImage(file).then((src) => setImage(label.id, src)).catch(() => {});
    }

    function saveAsPreset() {
        if (!label) { return; }
        setAdjust(label.id, working); // commit so the preset captures it
        const name = window.prompt('Name this preset:', label.text || 'Label preset');
        if (name === null) { return; }
        const saved = savePresetFromLabel(label.id, name);
        if (saved) { hint = `Saved preset “${saved}”.`; }
    }

    function onDialogClick(event) { if (event.target === dlg) { closeAdjust(); } }
</script>

<dialog id="adjust-dialog" bind:this={dlg} use:dialogSync={open} onclose={closeAdjust} onclick={onDialogClick}>
    <div id="adjust-dialog-body">
        <span class="group-label">Adjust image</span>

        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            id="adjust-preview"
            bind:this={previewEl}
            aria-label="Image preview"
            style="width:{previewW}px;height:{previewH}px"
            onpointerdown={onPreviewPointerDown}
        >
            {#if label}
                <div
                    class="text-container adjust-sample"
                    class:layout-beside={layout === 'beside'}
                    class:layout-fill={layout === 'fill'}
                    class:side-right={sideRight}
                    style={adjustStyle(working)}
                >
                    <div class="label-content">
                        <div class="label-image-frame"><img class="label-image" src={label.image} alt="" /></div>
                        <div class="label-text-area"><span class="text">{label.text}</span></div>
                    </div>
                </div>
            {/if}
        </div>
        <p id="adjust-hint">{hint}</p>

        <div class="adjust-controls">
            <div class="control-group">
                <span class="group-label">Layout</span>
                <div class="segmented">
                    <input type="radio" id="adj-layout-beside" name="adj-layout" value="beside" bind:group={working.layout} />
                    <label for="adj-layout-beside">Beside text</label>
                    <input type="radio" id="adj-layout-fill" name="adj-layout" value="fill" bind:group={working.layout} />
                    <label for="adj-layout-fill">Fill label</label>
                </div>
            </div>
            {#if working.layout === 'beside'}
                <div class="control-group" id="adj-side-group">
                    <span class="group-label">Image side</span>
                    <div class="segmented">
                        <input type="radio" id="adj-side-left" name="adj-side" value="left" bind:group={working.side} />
                        <label for="adj-side-left">Left</label>
                        <input type="radio" id="adj-side-right" name="adj-side" value="right" bind:group={working.side} />
                        <label for="adj-side-right">Right</label>
                    </div>
                </div>
            {/if}
            <div class="control-group">
                <span class="group-label">Fit</span>
                <div class="segmented">
                    <input type="radio" id="adj-fit-contain" name="adj-fit" value="contain" bind:group={working.fit} />
                    <label for="adj-fit-contain">Fit</label>
                    <input type="radio" id="adj-fit-cover" name="adj-fit" value="cover" bind:group={working.fit} />
                    <label for="adj-fit-cover">Fill</label>
                </div>
            </div>
            <div class="control-group">
                <span class="group-label">Align</span>
                <div id="adj-align-grid">
                    {#each ALIGN as a}
                        <button
                            type="button"
                            class="adj-align"
                            class:active={working.posX === a.x && working.posY === a.y}
                            data-x={a.x}
                            data-y={a.y}
                            aria-label={`Align ${a.x} ${a.y}`}
                            onclick={() => align(a)}
                        ></button>
                    {/each}
                </div>
            </div>
            <div class="control-group" id="adj-zoom-group">
                <span class="group-label">Zoom</span>
                <input type="range" id="adj-zoom" min="100" max="400" step="1" value={Math.round(working.zoom * 100)} oninput={setZoom} aria-label="Zoom" />
            </div>
        </div>

        <div id="adjust-actions">
            <button type="button" class="btn" id="adj-replace" onclick={replace}>Replace image&hellip;</button>
            <button type="button" class="btn" id="adj-remove" onclick={remove}>Remove image</button>
            <button type="button" class="btn" id="adj-save-preset" onclick={saveAsPreset}>Save as preset&hellip;</button>
            <button type="button" class="btn" id="adj-reset" onclick={reset}>Reset</button>
            <span class="adjust-actions-spacer"></span>
            <button type="button" class="btn" id="adj-cancel" onclick={closeAdjust}>Cancel</button>
            <button type="button" class="btn btn-primary" id="adj-apply" onclick={apply}>Apply</button>
        </div>

        <input type="file" bind:this={replaceInput} accept="image/*" hidden onchange={onReplacePick} />
    </div>
</dialog>
