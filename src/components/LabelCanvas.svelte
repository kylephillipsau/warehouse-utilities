<script>
    // The single renderer for a label's visual body. Two structural cases only:
    //   has image  -> the image fills the label; an optional caption band on top
    //   no image   -> ONE stable editable text region for the whole life of the
    //                 label. Empty shows a "Type a label" placeholder and typing
    //                 fills it in the SAME element, so the first keystroke never
    //                 swaps the node — caret + focus are always preserved.
    // Adding an image to an empty label is offered by the label's ⋯ menu, so the
    // body stays a single, simple text region with no competing affordances.
    // Used interactively by Label.svelte and statically by the editor preview.
    import { store } from '../lib/store.svelte.js';
    import { normalizeAdjust, zoomAtPoint, ZOOM_MIN, ZOOM_MAX } from '../lib/adjust.js';
    import { fitText } from '../actions/fitText.js';

    let {
        image = null,
        text = $bindable(''),
        adjust,
        editable = false,
        onImageClick = null,
        onAdjust = null,     // (partial) => void — inline pan/zoom writes back here
        showCaption = false,
    } = $props();

    // Inline direct manipulation. Best-practice split so the label list always
    // scrolls: the wheel and a one-finger vertical swipe scroll the page (never
    // zoom), resizing is done with explicit CORNER HANDLES, and the image body is
    // drag-to-pan / two-finger pinch / click-to-open-editor. `live` is seeded from
    // the prop at gesture start and accumulated locally — we never read the prop
    // back mid-gesture, so store round-trips can't fight the pointer.
    const clampPct = (v) => Math.min(100, Math.max(0, v));
    // Resize scales about the frame centre, so every corner behaves identically;
    // we skip the top-right one because the label's tool cluster (drag/edit/⋯)
    // lives there.
    const CORNERS = [
        { key: 'nw', cls: 'top-1 left-1 cursor-nwse-resize' },
        { key: 'sw', cls: 'bottom-1 left-1 cursor-nesw-resize' },
        { key: 'se', cls: 'bottom-1 right-1 cursor-nwse-resize' },
    ];
    const pointers = new Map();          // pointerId -> { x, y } in client px
    let mode = 'idle';                   // 'idle' | 'drag' | 'pinch'
    let gestured = false;                // moved/pinched (or cancelled) → suppress click
    let live = null;                     // { posX, posY, zoom, fit } during gesture
    let frameRect = null, imgW = 0, imgH = 0;
    let dragBase = null;                 // { sx, sy, baseX, baseY }
    let pinchPrev = null;                // { dist, mx, my } (mx,my in frame px)

    function pinchMetrics() {
        const [a, b] = [...pointers.values()];
        const dx = b.x - a.x, dy = b.y - a.y;
        return {
            dist: Math.hypot(dx, dy) || 1,
            mx: (a.x + b.x) / 2 - frameRect.left,
            my: (a.y + b.y) / 2 - frameRect.top,
        };
    }
    function beginDrag() {
        mode = 'drag';
        const p = [...pointers.values()][0];
        dragBase = { sx: p.x, sy: p.y, baseX: live.posX, baseY: live.posY };
    }
    function beginPinch() {
        mode = 'pinch';
        live = normalizeAdjust(adjust);   // re-seed so pinch accumulates from here
        pinchPrev = pinchMetrics();
    }

    function onImagePointerDown(event) {
        if (!onAdjust) { onImageClick?.(); return; }
        const img = event.currentTarget;
        frameRect = img.parentElement.getBoundingClientRect();
        imgW = img.naturalWidth; imgH = img.naturalHeight;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        live = normalizeAdjust(adjust);
        if (pointers.size === 1) { gestured = false; beginDrag(); }
        else if (pointers.size === 2) { beginPinch(); }
        // Identical (type, listener) pairs de-dupe, so a 2nd finger won't double-add.
        window.addEventListener('pointermove', onImageMove);
        window.addEventListener('pointerup', onImageUp);
        window.addEventListener('pointercancel', onImageCancel);
    }
    function onImageMove(event) {
        if (!pointers.has(event.pointerId)) { return; }
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (mode === 'drag') {
            const p = pointers.get(event.pointerId);
            const dx = (p.x - dragBase.sx) / frameRect.width * 100;
            const dy = (p.y - dragBase.sy) / frameRect.height * 100;
            if (Math.abs(dx) + Math.abs(dy) > 1.5) { gestured = true; }
            live.posX = clampPct(dragBase.baseX - dx);
            live.posY = clampPct(dragBase.baseY - dy);
            onAdjust({ posX: live.posX, posY: live.posY });
        } else if (mode === 'pinch' && pointers.size >= 2) {
            const cur = pinchMetrics();
            const next = zoomAtPoint(live, frameRect.width, frameRect.height, imgW, imgH, cur.dist / pinchPrev.dist, cur.mx, cur.my);
            // Follow the midpoint if the fingers also slide (pan while pinching).
            const dMx = (cur.mx - pinchPrev.mx) / frameRect.width * 100;
            const dMy = (cur.my - pinchPrev.my) / frameRect.height * 100;
            live = { ...live, posX: clampPct(next.posX - dMx), posY: clampPct(next.posY - dMy), zoom: next.zoom };
            gestured = true;
            onAdjust({ posX: live.posX, posY: live.posY, zoom: live.zoom });
            pinchPrev = cur;
        }
    }
    function endPointer(event, cancelled) {
        pointers.delete(event.pointerId);
        // A cancelled pointer (e.g. the browser claimed a scroll) must never be
        // read as a click-to-edit.
        if (cancelled) { gestured = true; }
        if (pointers.size >= 2) { beginPinch(); }
        else if (pointers.size === 1) { live = normalizeAdjust(adjust); beginDrag(); }
        else {
            window.removeEventListener('pointermove', onImageMove);
            window.removeEventListener('pointerup', onImageUp);
            window.removeEventListener('pointercancel', onImageCancel);
            mode = 'idle';
            if (!gestured) { onImageClick?.(); }
        }
    }
    function onImageUp(event) { endPointer(event, false); }
    function onImageCancel(event) { endPointer(event, true); }

    // Corner handle: drag to resize (scale about the frame centre, matching the
    // centre-origin transform used to render). Scoped to its own pointer capture
    // so it never triggers the body pan / click.
    function onHandlePointerDown(event) {
        if (!onAdjust) { return; }
        event.preventDefault();
        event.stopPropagation();
        const frame = event.currentTarget.parentElement.getBoundingClientRect();
        const cx = frame.left + frame.width / 2, cy = frame.top + frame.height / 2;
        const z0 = normalizeAdjust(adjust).zoom || 1;
        const d0 = Math.hypot(event.clientX - cx, event.clientY - cy) || 1;
        const move = (ev) => {
            const d1 = Math.hypot(ev.clientX - cx, ev.clientY - cy);
            onAdjust({ zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z0 * (d1 / d0))) });
        };
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
    }

    const hasImage = $derived(!!image);
    const hasText = $derived(!!(text && text.length > 0));
    const showCaptionBand = $derived(hasImage && (hasText || (editable && showCaption)));

    // Re-fit trigger; the box also resizes on size/orientation change (handled
    // by the ResizeObserver inside the fitText action)
    const fitKey = $derived(
        `${text}|${store.page.preset}|${store.page.width}|${store.page.height}|` +
        `${store.divisions}|${store.margin}|${store.gap}|${hasImage ? 1 : 0}`
    );
</script>

<div class="label-content">
    {#if hasImage}
        <div class="label-image-frame">
            {#if editable && onImageClick}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <img class="label-image editable" src={image} alt="" title="Drag to move · drag a corner to resize · click to edit" draggable="false" onpointerdown={onImagePointerDown} />
                {#if onAdjust}
                    {#each CORNERS as h (h.key)}
                        <!-- svelte-ignore a11y_no_static_element_interactions -->
                        <span class="resize-handle {h.cls}" aria-hidden="true" title="Drag to resize" onpointerdown={onHandlePointerDown}></span>
                    {/each}
                {/if}
            {:else}
                <img class="label-image" src={image} alt="" />
            {/if}
        </div>
        {#if showCaptionBand}
            <div class="label-caption">
                {#if editable}
                    <span class="text" role="textbox" aria-label="Caption" aria-multiline="false" contenteditable="true" bind:textContent={text} use:fitText={fitKey} data-placeholder="Add caption"></span>
                {:else}
                    <span class="text">{text}</span>
                {/if}
            </div>
        {/if}
    {:else}
        <!-- One editable region for the whole life of a text label: empty shows
             the placeholder, typing fills it in place. -->
        <div class="label-text-area">
            {#if editable}
                <span class="text" role="textbox" aria-label="Label text" aria-multiline="false" contenteditable="true" bind:textContent={text} use:fitText={fitKey} data-placeholder="Type a label"></span>
            {:else}
                <span class="text">{text}</span>
            {/if}
        </div>
    {/if}
</div>
