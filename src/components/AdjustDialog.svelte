<script>
    import { ui, closeAdjust } from '../lib/ui.svelte.js';
    import { store, setAdjust, setImage, removeImage } from '../lib/store.svelte.js';
    import { DEFAULT_ADJUST, normalizeAdjust, adjustStyle, zoomAtPoint, FIT_OPTIONS, ALIGN_CELLS, ZOOM_MIN, ZOOM_MAX } from '../lib/adjust.js';
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
        // Never exceed the dialog's inner width on small screens: dialog is
        // min(40rem, 100vw - 2rem) with 1.25rem padding each side.
        const avail = (window.innerWidth || 360) - 32 - 40;
        const maxW = Math.min(360, avail), maxH = 260;
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
    // Human-readable name for an alignment cell (0/50/100 percentages)
    const H = { 0: 'left', 50: 'centre', 100: 'right' };
    const V = { 0: 'top', 50: 'middle', 100: 'bottom' };
    function alignLabel(a) {
        if (a.x === 50 && a.y === 50) { return 'Align centre'; }
        return `Align ${V[a.y]} ${H[a.x]}`;
    }
    const clampPct = (v) => Math.min(100, Math.max(0, v));
    function recenterPan() { working.posX = 50; working.posY = 50; }   // pan only, keep zoom
    function fit() { working.zoom = 1; working.posX = 50; working.posY = 50; }
    function reset() { working = normalizeAdjust(DEFAULT_ADJUST); }

    // Zoom by `factor`, keeping the image point under (mx,my) in the preview box
    // fixed — the standard "zoom to cursor" (shared math in adjust.js).
    function zoomAt(factor, mx, my) {
        const box = previewEl && previewEl.getBoundingClientRect();
        if (!box) { return; }
        const imgEl = previewEl.querySelector('img.label-image');
        const iw = imgEl ? imgEl.naturalWidth : 0, ih = imgEl ? imgEl.naturalHeight : 0;
        const next = zoomAtPoint(working, box.width, box.height, iw, ih, factor, mx, my);
        working.posX = next.posX; working.posY = next.posY; working.zoom = next.zoom;
    }
    function onWheel(event) {
        event.preventDefault();
        const box = previewEl.getBoundingClientRect();
        zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX - box.left, event.clientY - box.top);
    }
    function onKey(event) {
        const step = event.shiftKey ? 10 : 1;
        const box = previewEl.getBoundingClientRect();
        switch (event.key) {
            case 'ArrowLeft': working.posX = clampPct(working.posX - step); break;
            case 'ArrowRight': working.posX = clampPct(working.posX + step); break;
            case 'ArrowUp': working.posY = clampPct(working.posY - step); break;
            case 'ArrowDown': working.posY = clampPct(working.posY + step); break;
            case '+': case '=': zoomAt(1.1, box.width / 2, box.height / 2); break;
            case '-': case '_': zoomAt(1 / 1.1, box.width / 2, box.height / 2); break;
            case '0': fit(); break;
            default: return;
        }
        event.preventDefault();
    }

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

<dialog id="adjust-dialog" class="dialog dialog-wide" aria-labelledby="adjust-title" bind:this={dlg} use:dialogSync={open} onclose={closeAdjust} onclick={onDialogClick}>
    <div class="flex flex-col gap-[0.85rem] p-5">
        <span class="group-label" id="adjust-title">Edit image</span>

        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            id="adjust-preview"
            class="adjust-preview"
            bind:this={previewEl}
            role="group"
            tabindex="0"
            aria-label="Image preview. Drag or arrow keys to reposition, scroll or +/- to zoom, 0 to fit."
            aria-describedby="adjust-status"
            style="width:{previewW}px;height:{previewH}px"
            onpointerdown={onPreviewPointerDown}
            ondblclick={recenterPan}
            onwheel={onWheel}
            onkeydown={onKey}
        >
            {#if label}
                <div class="text-container" style={adjustStyle(working)}>
                    <LabelCanvas image={label.image} text={label.text} adjust={working} />
                </div>
            {/if}
        </div>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p class="m-0 text-[0.8rem] leading-[1.4] text-ink/70">Drag or arrows to move · scroll or +/− to zoom.</p>
            <span class="flex-1"></span>
            <button type="button" class="btn px-[0.7rem] py-[0.2rem] text-[0.8rem]" onclick={recenterPan}>Recenter</button>
            <button type="button" class="btn px-[0.7rem] py-[0.2rem] text-[0.8rem]" onclick={fit}>Fit</button>
        </div>
        <p id="adjust-status" class="m-0 text-[0.8rem] tabular-nums text-ink/60" role="status" aria-live="polite">Position {Math.round(working.posX)}% × {Math.round(working.posY)}% · size {Math.round(working.zoom * 100)}%</p>

        <div class="flex flex-wrap gap-x-5 gap-y-3">
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
                <span class="group-label" id="adj-align-label">Position</span>
                <div id="adj-align-grid" class="grid grid-cols-3 gap-[3px] w-fit" role="group" aria-labelledby="adj-align-label">
                    {#each ALIGN_CELLS as a}
                        <button
                            type="button"
                            class="w-[22px] h-[22px] p-0 border-2 rounded-[4px] cursor-pointer
                                   {working.posX === a.x && working.posY === a.y
                                       ? 'bg-purple border-purple'
                                       : 'bg-paper border-ink hover:bg-ink/[0.08]'}"
                            data-x={a.x}
                            data-y={a.y}
                            aria-pressed={working.posX === a.x && working.posY === a.y}
                            aria-label={alignLabel(a)}
                            onclick={() => align(a)}
                        ></button>
                    {/each}
                </div>
            </div>
            <div class="control-group flex-[1_1_14rem]" id="adj-zoom-group">
                <span class="group-label">Size</span>
                <div class="flex items-center gap-2">
                    <input type="range" id="adj-zoom" class="min-w-[6rem] flex-1 accent-purple" min={ZOOM_MIN * 100} max={ZOOM_MAX * 100} step="1" value={Math.round(working.zoom * 100)} oninput={setZoom} aria-label="Image size" />
                    <input type="number" id="adj-zoom-num" class="w-[4.75rem]" min={ZOOM_MIN * 100} max={ZOOM_MAX * 100} step="1" value={Math.round(working.zoom * 100)} onchange={setZoom} aria-label="Scale percent" />
                    <span class="text-[0.9rem] text-ink/60">%</span>
                </div>
            </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
            <button type="button" class="btn" id="adj-replace" onclick={replace}>Replace image&hellip;</button>
            <button type="button" class="btn" id="adj-remove" onclick={remove}>Remove image</button>
            <button type="button" class="btn" id="adj-reset" onclick={reset}>Reset</button>
            <span class="flex-1"></span>
            <button type="button" class="btn" id="adj-cancel" onclick={closeAdjust}>Cancel</button>
            <button type="button" class="btn btn-primary" id="adj-apply" onclick={done}>Done</button>
        </div>

        <input type="file" bind:this={replaceInput} accept="image/*" hidden onchange={onReplacePick} />
    </div>
</dialog>
