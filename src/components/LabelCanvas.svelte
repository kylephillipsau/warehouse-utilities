<script>
    // The single renderer for a label's visual body (frame + image + text).
    // Used interactively by Label.svelte and statically by the Adjust dialog
    // preview, so the two can never drift. Layout/side classes and the adjust
    // CSS vars live on the parent .text-container; this component owns only the
    // .label-content subtree.
    import { store } from '../lib/store.svelte.js';
    import { fitText } from '../actions/fitText.js';
    import { panImage } from '../actions/panImage.js';
    import { zoomImage } from '../actions/zoomImage.js';

    let {
        image = null,
        text = $bindable(''),
        adjust,
        editable = false,
        id = null,
        onImageClick = null,
    } = $props();

    const hasImage = $derived(!!image);
    const layout = $derived(hasImage && adjust.layout === 'fill' ? 'fill' : 'beside');

    // Re-fit trigger for editable labels (ignored when not editable)
    const fitKey = $derived(
        `${text}|${store.size.preset}|${store.size.width}|${store.size.height}|` +
        `${store.orientation}|${hasImage ? 1 : 0}|${adjust.split}|${layout}`
    );
</script>

<div class="label-content">
    {#if image}
        <div class="label-image-frame">
            {#if editable}
                <img
                    class="label-image"
                    src={image}
                    alt=""
                    use:panImage={{ id, getAdjust: () => adjust, onClick: onImageClick }}
                    use:zoomImage={{ id, getAdjust: () => adjust }}
                />
            {:else}
                <img class="label-image" src={image} alt="" />
            {/if}
        </div>
    {/if}
    <div class="label-text-area">
        {#if editable}
            <span class="text" contenteditable="true" bind:textContent={text} use:fitText={fitKey}></span>
        {:else}
            <span class="text">{text}</span>
        {/if}
    </div>
</div>
