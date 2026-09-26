<script>
    // A label in miniature, for an option that previews its result. The artwork
    // is laid out at its TRUE size (so the fitter wraps and sizes the text as
    // the real label does) and then scaled into a fixed box, the same trick the
    // sheet uses. Two thumbnails in one box size compare as shapes.
    import LabelCanvas from './LabelCanvas.svelte';

    let { width, height, text, boxW = 112, boxH = 60 } = $props();

    const PX_PER_MM = 96 / 25.4;
    const k = $derived(Math.min(boxW / (width * PX_PER_MM), boxH / (height * PX_PER_MM)));
</script>

<span class="label-thumb" style:width="{boxW}px" style:height="{boxH}px" aria-hidden="true">
    <span class="label-thumb-paper" style:width="{width * PX_PER_MM * k}px" style:height="{height * PX_PER_MM * k}px">
        <span class="label-thumb-art" style:width="{width}mm" style:height="{height}mm" style:transform="scale({k})">
            <LabelCanvas {text} />
        </span>
    </span>
</span>
