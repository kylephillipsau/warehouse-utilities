<script>
    // A label in miniature, for anything that previews a result. The artwork
    // is laid out at its TRUE size (so the fitter wraps and sizes the text as
    // the real label does) and then scaled into a box, the same trick the sheet
    // uses. Pass `text` for plain text, or `label` for a whole label or preset
    // (image, caption, template fields); the same renderers draw it.
    import LabelCanvas from './LabelCanvas.svelte';
    import FieldsLabel from './FieldsLabel.svelte';
    import { adjustStyle } from '../lib/adjust.js';

    let { width, height, text = '', label = null, boxW = 112, boxH = 60 } = $props();

    const PX_PER_MM = 96 / 25.4;
    const k = $derived(Math.max(0.01, Math.min(boxW / (width * PX_PER_MM), boxH / (height * PX_PER_MM))));
    const isTemplate = $derived(!!(label && label.fields && label.fields.length));
</script>

<span class="label-thumb" style:width="{boxW}px" style:height="{boxH}px" aria-hidden="true">
    <span class="label-thumb-paper" style:width="{width * PX_PER_MM * k}px" style:height="{height * PX_PER_MM * k}px">
        <span class="label-thumb-art" style:width="{width}mm" style:height="{height}mm" style:transform="scale({k})"
              style={label && label.image ? adjustStyle(label.adjust) : undefined}>
            {#if isTemplate}
                <FieldsLabel {label} />
            {:else if label}
                <LabelCanvas image={label.image} text={label.text || ''} adjust={label.adjust} />
            {:else}
                <LabelCanvas {text} />
            {/if}
        </span>
    </span>
</span>
