<script>
    import { ui, closeAdjust } from '../lib/ui.svelte.js';
    import { store, setAdjust, setImage, removeImage } from '../lib/store.svelte.js';
    import { DEFAULT_ADJUST, normalizeAdjust, adjustStyle, FIT_OPTIONS, ALIGN_CELLS, ZOOM_MIN, ZOOM_MAX } from '../lib/adjust.js';
    import { fileToLabelImage } from '../lib/image.js';
    import { dialogSync } from '../actions/dialogSync.js';
    import LabelCanvas from './LabelCanvas.svelte';

    let dlg;
    let replaceInput;
    let previewEl;
    let working = $state(normalizeAdjust(DEFAULT_ADJUST));
    let previewW = $state(340);
    let previewH = $state(200);
    let lastId = null;

    const label = $derived(store.labels.find((l) => l.id === ui.adjustTargetId));
    const open = $derived(ui.adjustTargetId != null);

    // Initialise the working copy + preview size when a label is opened
    $effect(() => {
        const id = ui.adjustTargetId;
        if (id === lastId) { return; }
        lastId = id;
        if (id == null) { return; }
        const l = store.labels.find((x) => x.id === id);
        if (!l) { return; }
        working = normalizeAdjust(l.adjust);
        const el = document.querySelector(`[data-id="${id}"]`);
        const rect = el ? el.getBoundingClientRect() : null;
        const aspect = rect && rect.width && rect.height ? rect.width / rect.height : 100 / 22;
        const maxW = 360, maxH = 260;
        let w = maxW, h = w / aspect;
        if (h > maxH) { h = maxH; w = h * aspect; }
        previewW = Math.round(w);
        previewH = Math.round(h);
    });

    function setZoom(event) {
        const z = parseFloat(event.target.value) / 100;
        working.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, isNaN(z) ? 1 : z));
    }
    function align(a) { working.posX = a.x; working.posY = a.y; }
    function recenter() { working.posX = 50; working.posY = 50; working.zoom = 1; }
    function reset() { working = normalizeAdjust(DEFAULT_ADJUST); }

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

    function done() {
        if (label) { setAdjust(label.id, working); }
        closeAdjust();
    }
    function remove() { if (label) { removeImage(label.id); } closeAdjust(); }
    function replace() { replaceInput.click(); }
    function onReplacePick(event) {
        const file = event.target.files[0];
        event.target.value = '';
        if (!file || !label) { return; }
        fileToLabelImage(file).then((src) => setImage(label.id, src)).catch(() => {});
    }

    function onDialogClick(event) { if (event.target === dlg) { closeAdjust(); } }
</script>

<dialog id="adjust-dialog" bind:this={dlg} use:dialogSync={open} onclose={closeAdjust} onclick={onDialogClick}>
    <div id="adjust-dialog-body">
        <span class="group-label">Edit image</span>

        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            id="adjust-preview"
            bind:this={previewEl}
            aria-label="Image preview — drag to reposition, double-click to recentre"
            style="width:{previewW}px;height:{previewH}px"
            onpointerdown={onPreviewPointerDown}
            ondblclick={recenter}
        >
            {#if label}
                <div class="text-container adjust-sample" style={adjustStyle(working)}>
                    <LabelCanvas image={label.image} text={label.text} adjust={working} />
                </div>
            {/if}
        </div>
        <p id="adjust-hint">Drag the image to reposition. Double-click to recentre.</p>

        <div class="adjust-controls">
            <div class="control-group">
                <span class="group-label">Scale</span>
                <div class="segmented">
                    {#each FIT_OPTIONS as opt}
                        <input type="radio" id={`adj-fit-${opt.value}`} name="adj-fit" value={opt.value} bind:group={working.fit} />
                        <label for={`adj-fit-${opt.value}`}>{opt.label}</label>
                    {/each}
                </div>
            </div>
            <div class="control-group">
                <span class="group-label">Position</span>
                <div id="adj-align-grid">
                    {#each ALIGN_CELLS as a}
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
                <span class="group-label">Size <span class="zoom-readout">{Math.round(working.zoom * 100)}%</span></span>
                <input type="range" id="adj-zoom" min={ZOOM_MIN * 100} max={ZOOM_MAX * 100} step="1" value={Math.round(working.zoom * 100)} oninput={setZoom} aria-label="Image size" />
            </div>
        </div>

        <div id="adjust-actions">
            <button type="button" class="btn" id="adj-replace" onclick={replace}>Replace image&hellip;</button>
            <button type="button" class="btn" id="adj-remove" onclick={remove}>Remove image</button>
            <button type="button" class="btn" id="adj-reset" onclick={reset}>Reset</button>
            <span class="adjust-actions-spacer"></span>
            <button type="button" class="btn" id="adj-cancel" onclick={closeAdjust}>Cancel</button>
            <button type="button" class="btn btn-primary" id="adj-apply" onclick={done}>Done</button>
        </div>

        <input type="file" bind:this={replaceInput} accept="image/*" hidden onchange={onReplacePick} />
    </div>
</dialog>
