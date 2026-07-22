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
    import { normalizeAdjust, ZOOM_MIN, ZOOM_MAX } from '../lib/adjust.js';
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

    // Inline direct manipulation: drag the image to pan, wheel to zoom, and a
    // click with no drag opens the editor (Replace / fit / precise / keyboard).
    function onImagePointerDown(event) {
        if (!onAdjust) { onImageClick?.(); return; }
        event.preventDefault();
        const frame = event.currentTarget.parentElement.getBoundingClientRect();
        const startX = event.clientX, startY = event.clientY;
        const a = normalizeAdjust(adjust);
        const baseX = a.posX, baseY = a.posY;
        let moved = false;
        const move = (ev) => {
            const dx = (ev.clientX - startX) / frame.width * 100;
            const dy = (ev.clientY - startY) / frame.height * 100;
            if (Math.abs(dx) + Math.abs(dy) > 1.5) { moved = true; }
            onAdjust({ posX: Math.min(100, Math.max(0, baseX - dx)), posY: Math.min(100, Math.max(0, baseY - dy)) });
        };
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            if (!moved) { onImageClick?.(); }
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    }
    function onImageWheel(event) {
        if (!onAdjust) { return; }
        event.preventDefault();
        const a = normalizeAdjust(adjust);
        const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, (a.zoom || 1) * Math.exp(-event.deltaY * 0.0015)));
        onAdjust({ zoom: z });
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
                <img class="label-image editable" src={image} alt="" title="Drag to move · scroll to zoom · click to edit" draggable="false" onpointerdown={onImagePointerDown} onwheel={onImageWheel} />
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
