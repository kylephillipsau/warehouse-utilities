<script>
    import { store, addLabels, addImageLabel } from '../lib/store.svelte.js';
    import { isCustom } from '../lib/size.js';
    import { fileToLabelImage } from '../lib/image.js';
    import { openPresets, openImport, openExport } from '../lib/ui.svelte.js';

    let text = $state('');
    let quantity = $state('');
    let imageInput;

    function add() {
        addLabels(text, quantity);
        text = '';
        quantity = '';
    }

    function onEnter(event) {
        if (event.key === 'Enter') { add(); }
    }

    function onPickNewImage(event) {
        const file = event.target.files[0];
        event.target.value = '';
        if (!file) { return; }
        fileToLabelImage(file).then((src) => addImageLabel(src)).catch(() => {});
    }

    // First switch to custom starts from the standard size rather than blank
    $effect(() => {
        if (isCustom(store.size)) {
            if (store.size.width === '') { store.size.width = 100; }
            if (store.size.height === '') { store.size.height = 22; }
        }
    });

    // Drop a shadow under the toolbar once labels scroll beneath it
    let scrolled = $state(false);
    function onScroll() { scrolled = window.scrollY > 0; }
</script>

<svelte:window onscroll={onScroll} />

<header id="header" class:scrolled>
    <div id="details-panel">
        <h1 id="heading">Label Maker V2</h1>
        <div id="subtitle">
            <a id="home" href="/index.html">Home</a>
            <a id="source" href="https://github.com/kylephillipsau/warehouse-utilities">Source</a>
            <a id="old-version" href="/old/labels.html">v1</a>
        </div>
    </div>
    <div id="controls">
        <div class="control-group">
            <span class="group-label">New label</span>
            <div class="group-row">
                <input type="text" id="labelText" placeholder="Label text" aria-label="Label text" bind:value={text} onkeypress={onEnter} />
                <input type="number" id="labelQuantity" placeholder="Qty" aria-label="Quantity" min="1" max="100" bind:value={quantity} onkeypress={onEnter} />
                <input type="button" class="btn btn-primary" value="Add" onclick={add} />
                <input type="button" class="btn" id="addImage" value="Add image" onclick={() => imageInput.click()} />
                <input type="button" class="btn" id="inputMultiple" value="Import list" onclick={openImport} />
            </div>
        </div>
        <div class="control-group">
            <span class="group-label">Label size</span>
            <div class="group-row">
                <select id="label-size" aria-label="Label size preset" bind:value={store.size.preset}>
                    <option value="standard">Standard (100 &times; 22 mm)</option>
                    <option value="address">Address (89 &times; 28 mm)</option>
                    <option value="large-address">Large address (89 &times; 36 mm)</option>
                    <option value="shipping">Shipping (100 &times; 150 mm)</option>
                    <option value="custom">Custom&hellip;</option>
                </select>
                {#if isCustom(store.size)}
                    <span id="custom-size">
                        <input type="number" id="custom-width" min="10" max="500" step="0.5" aria-label="Label width in millimetres" bind:value={store.size.width} />
                        &times;
                        <input type="number" id="custom-height" min="10" max="500" step="0.5" aria-label="Label height in millimetres" bind:value={store.size.height} />
                        mm
                    </span>
                {/if}
            </div>
        </div>
        <div class="control-group">
            <span class="group-label">Page</span>
            <div class="segmented">
                <input type="radio" id="portrait" name="orientation" value="portrait" bind:group={store.orientation} />
                <label for="portrait">Portrait</label>
                <input type="radio" id="landscape" name="orientation" value="landscape" bind:group={store.orientation} />
                <label for="landscape">Landscape</label>
            </div>
        </div>
        <button id="presets-button" class="btn" onclick={openPresets}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" aria-hidden="true">
                <path d="M316.9 18C311.6 7 300.4 0 288.1 0s-23.6 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L470.2 329 574.3 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L413 150.3 316.9 18z" />
            </svg>
            Presets
        </button>
        <button id="export-button" class="btn" onclick={openExport}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true">
                <path d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32V274.7l-73.4-73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l128-128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L288 274.7V32zM64 352c-35.3 0-64 28.7-64 64v32c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V416c0-35.3-28.7-64-64-64H346.5l-45.3 45.3c-25 25-65.5 25-90.5 0L165.5 352H64zm368 56a24 24 0 1 1 0 48 24 24 0 1 1 0-48z" />
            </svg>
            Export
        </button>
        <button id="print-button" class="btn" onclick={() => window.print()}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true">
                <path d="M448 192H64C28.65 192 0 220.7 0 256v96c0 17.67 14.33 32 32 32h32v96c0 17.67 14.33 32 32 32h320c17.67 0 32-14.33 32-32v-96h32c17.67 0 32-14.33 32-32V256C512 220.7 483.3 192 448 192zM384 448H128v-96h256V448zM432 296c-13.25 0-24-10.75-24-24c0-13.27 10.75-24 24-24s24 10.73 24 24C456 285.3 445.3 296 432 296zM128 64h229.5L384 90.51V160h64V77.25c0-8.484-3.375-16.62-9.375-22.62l-45.25-45.25C387.4 3.375 379.2 0 370.8 0H96C78.34 0 64 14.33 64 32v128h64V64z" />
            </svg>
            Print
        </button>
    </div>

    <input type="file" bind:this={imageInput} accept="image/*" hidden onchange={onPickNewImage} />
</header>
