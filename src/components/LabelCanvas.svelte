<script>
    // The single renderer for a label's visual body, by content type:
    //   image only    -> the image fills the label; NO text layer in front
    //   text only      -> the text fills the label (auto-fitted)
    //   image + caption -> image fills, caption text in a readable band
    //   empty (editable) -> a placeholder: type text, or add an image
    // Used interactively by Label.svelte and statically by the editor preview.
    import { store } from '../lib/store.svelte.js';
    import { fitText } from '../actions/fitText.js';

    let {
        image = null,
        text = $bindable(''),
        adjust,
        editable = false,
        onImageClick = null,
        onAddImage = null,
        showCaption = false,
    } = $props();

    const hasImage = $derived(!!image);
    const hasText = $derived(!!(text && text.length > 0));
    const showText = $derived(hasText || (editable && showCaption));

    // Re-fit trigger; the box also resizes on size/orientation change (handled
    // by the ResizeObserver inside the fitText action)
    const fitKey = $derived(
        `${text}|${store.size.preset}|${store.size.width}|${store.size.height}|` +
        `${store.orientation}|${hasImage ? 1 : 0}`
    );
</script>

<div class="label-content" class:has-caption={hasImage && showText}>
    {#if hasImage}
        <div class="label-image-frame">
            {#if editable && onImageClick}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <img class="label-image editable" src={image} alt="" title="Edit image" onclick={onImageClick} />
            {:else}
                <img class="label-image" src={image} alt="" />
            {/if}
        </div>
        {#if showText}
            <div class="label-caption">
                {#if editable}
                    <span class="text" contenteditable="true" bind:textContent={text} use:fitText={fitKey} data-placeholder="Add caption"></span>
                {:else}
                    <span class="text">{text}</span>
                {/if}
            </div>
        {/if}
    {:else if hasText || !editable}
        <div class="label-text-area">
            {#if editable}
                <span class="text" contenteditable="true" bind:textContent={text} use:fitText={fitKey}></span>
            {:else}
                <span class="text">{text}</span>
            {/if}
        </div>
    {:else}
        <div class="label-empty">
            <span class="text label-empty-text" contenteditable="true" bind:textContent={text} use:fitText={fitKey} data-placeholder="Type a label"></span>
            <button type="button" class="label-add-image" onclick={onAddImage}>&#43; Add image</button>
        </div>
    {/if}
</div>
