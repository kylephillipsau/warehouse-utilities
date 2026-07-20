<script>
    import { store, addLabels, addImageLabel, clearAllLabels } from '../lib/store.svelte.js';
    import { MEDIA_PRESETS, isCustom, clampDivisions, clampSpacing, MAX_DIVISIONS, MAX_SPACING } from '../lib/size.js';
    import { fileToLabelImage } from '../lib/image.js';
    import { ui, openExport } from '../lib/ui.svelte.js';
    import Select from './Select.svelte';

    // The two side drawers toggle from their toolbar buttons (and stay visibly
    // active while their panel is open).
    function toggleImport() { ui.presetsOpen = false; ui.importOpen = !ui.importOpen; }
    function togglePresets() { ui.importOpen = false; ui.presetsOpen = !ui.presetsOpen; }

    let text = $state('');
    let quantity = $state('');
    let imageInput;
    let setupOpen = $state(false);
    let setupEl;

    const TIP_KEY = 'labelMakerPrintTipDismissed';
    let showTip = $state((() => { try { return localStorage.getItem(TIP_KEY) !== '1'; } catch (e) { return true; } })());
    function dismissTip() { showTip = false; try { localStorage.setItem(TIP_KEY, '1'); } catch (e) { /* ignore */ } }

    const mediaGroups = Object.entries(MEDIA_PRESETS).reduce((acc, [key, v]) => {
        (acc[v.group] ||= []).push({ key, label: v.label });
        return acc;
    }, {});
    const pageOptions = [
        ...Object.entries(mediaGroups).flatMap(([group, entries]) =>
            entries.map((e) => ({ value: e.key, label: e.label, group })),
        ),
        { value: 'custom', label: 'Custom…' },
    ];
    const unitOptions = [{ value: 'mm', label: 'mm' }, { value: 'in', label: 'in' }];

    function add() {
        addLabels(text, quantity);
        text = '';
        quantity = '';
    }
    function onEnter(event) { if (event.key === 'Enter') { add(); } }

    function onPickNewImage(event) {
        const file = event.target.files[0];
        event.target.value = '';
        if (!file) { return; }
        fileToLabelImage(file).then((src) => addImageLabel(src)).catch(() => {});
    }

    function onDivisions(event) { store.divisions = clampDivisions(event.target.value); }
    function onMargin(event) { store.margin = clampSpacing(event.target.value); }
    function onGap(event) { store.gap = clampSpacing(event.target.value); }

    $effect(() => {
        if (isCustom(store.page)) {
            if (store.page.width === '') { store.page.width = store.page.unit === 'in' ? 4 : 101.6; }
            if (store.page.height === '') { store.page.height = store.page.unit === 'in' ? 6 : 152.4; }
        }
    });

    // Mobile setup popover: close on Escape / outside click
    $effect(() => {
        if (!setupOpen) { return; }
        const onDoc = (e) => { if (setupEl && !setupEl.contains(e.target)) { setupOpen = false; } };
        const onKey = (e) => { if (e.key === 'Escape') { setupOpen = false; } };
        document.addEventListener('pointerdown', onDoc, true);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onDoc, true);
            document.removeEventListener('keydown', onKey);
        };
    });

    let scrolled = $state(false);
    function onScroll() { scrolled = window.scrollY > 0; }
</script>

<svelte:window onscroll={onScroll} />

<!-- The layout controls, rendered once and placed inline on desktop or inside
     the mobile "Label setup" popover (so ids never duplicate). -->
{#snippet settingsFields()}
    <div class="control-group">
        <span class="group-label">Page / media</span>
        <div class="group-row">
            <Select id="page-size" ariaLabel="Page / media size" class="w-[14rem] max-w-full" options={pageOptions} bind:value={store.page.preset} />
            {#if isCustom(store.page)}
                <span class="inline-flex items-center gap-[0.3rem] text-[0.85rem]">
                    <input type="number" id="page-width" class="w-[6ch]" min="5" max="1000" step="0.1" aria-label="Page width" bind:value={store.page.width} />
                    &times;
                    <input type="number" id="page-height" class="w-[6ch]" min="5" max="1000" step="0.1" aria-label="Page height" bind:value={store.page.height} />
                    <Select ariaLabel="Page size unit" class="w-[4.75rem]" options={unitOptions} bind:value={store.page.unit} />
                </span>
            {/if}
        </div>
    </div>
    <div class="control-group">
        <span class="group-label">Divide into labels</span>
        <div class="group-row">
            <input type="number" id="divisions" class="w-[7ch]" min="1" max={MAX_DIVISIONS} step="1" aria-label="Number of labels per page" value={store.divisions} oninput={onDivisions} />
            <span class="text-[0.8rem] text-ink/70">up</span>
        </div>
    </div>
    <div class="control-group">
        <span class="group-label">Margin (mm)</span>
        <input type="number" id="page-margin" class="w-[7ch]" min="0" max={MAX_SPACING} step="0.5" aria-label="Page margin in millimetres" value={store.margin} onchange={onMargin} />
    </div>
    <div class="control-group">
        <span class="group-label">Gap (mm)</span>
        <input type="number" id="label-gap" class="w-[7ch]" min="0" max={MAX_SPACING} step="0.5" aria-label="Gap between labels in millimetres" value={store.gap} onchange={onGap} />
    </div>
    <div class="control-group">
        <span class="group-label">Orientation</span>
        <div class="segmented">
            <input type="radio" id="portrait" name="orientation" value="portrait" bind:group={store.orientation} />
            <label for="portrait">Portrait</label>
            <input type="radio" id="landscape" name="orientation" value="landscape" bind:group={store.orientation} />
            <label for="landscape">Landscape</label>
        </div>
    </div>
{/snippet}

<header
    id="header"
    class="sticky top-0 z-10 flex flex-col gap-[0.6rem] bg-paper text-ink border-b-[3px] border-ink px-4 py-[0.6rem] transition-shadow"
    style:box-shadow={scrolled ? 'var(--shadow-popover)' : 'none'}
>
    <!-- Tier 1: app bar -->
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-[0.6rem]">
        <div class="flex min-w-0 items-baseline gap-3">
            <h1 id="heading" class="m-0 whitespace-nowrap rounded bg-ink px-[0.8rem] pt-[0.4rem] pb-[0.3rem] text-[0.9rem] font-bold uppercase tracking-[0.12em] text-paper">Label Maker</h1>
            <div id="subtitle" class="flex items-center gap-2 text-[0.7rem]">
                <a href="/index.html" class="font-bold uppercase tracking-[0.1em] text-purple no-underline hover:underline">Home</a>
                <a href="https://github.com/kylephillipsau/warehouse-utilities" class="border-l border-ink/25 pl-2 font-bold uppercase tracking-[0.1em] text-purple no-underline hover:underline">Source</a>
                <a href="/old/labels.html" class="border-l border-ink/25 pl-2 font-bold uppercase tracking-[0.1em] text-purple no-underline hover:underline">v1</a>
            </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
            <button id="presets-button" class="btn" class:btn-active={ui.presetsOpen} aria-pressed={ui.presetsOpen} onclick={togglePresets} title="Preset labels">
                <svg class="size-[1.05em] shrink-0 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" aria-hidden="true"><path d="M316.9 18C311.6 7 300.4 0 288.1 0s-23.6 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L470.2 329 574.3 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L413 150.3 316.9 18z" /></svg>
                <span class="btn-label max-md:hidden">Presets</span>
            </button>
            <button id="import-button" class="btn" class:btn-active={ui.importOpen} aria-pressed={ui.importOpen} onclick={toggleImport} title="Import a list or label file">
                <svg class="size-[1.05em] shrink-0 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true"><path d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32V274.7l-73.4-73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l128-128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L288 274.7V32zM64 352c-35.3 0-64 28.7-64 64v32c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V416c0-35.3-28.7-64-64-64H346.5l-45.3 45.3c-25 25-65.5 25-90.5 0L165.5 352H64zm368 56a24 24 0 1 1 0 48 24 24 0 1 1 0-48z" transform="rotate(180 256 256)" /></svg>
                <span class="btn-label max-md:hidden">Import</span>
            </button>
            <button id="export-button" class="btn" onclick={openExport} title="Save labels to a file">
                <svg class="size-[1.05em] shrink-0 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true"><path d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32V274.7l-73.4-73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l128-128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L288 274.7V32zM64 352c-35.3 0-64 28.7-64 64v32c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V416c0-35.3-28.7-64-64-64H346.5l-45.3 45.3c-25 25-65.5 25-90.5 0L165.5 352H64zm368 56a24 24 0 1 1 0 48 24 24 0 1 1 0-48z" /></svg>
                <span class="btn-label max-md:hidden">Export</span>
            </button>
            <button id="clear-button" class="btn" disabled={store.labels.length === 0} onclick={clearAllLabels} title="Clear all labels (undoable)">
                <svg class="size-[1.05em] shrink-0 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" aria-hidden="true"><path d="M135.2 17.7L128 32H32C14.3 32 0 46.3 0 64S14.3 96 32 96H416c17.7 0 32-14.3 32-32s-14.3-32-32-32H320l-7.2-14.3C307.4 6.8 296.3 0 284.2 0H163.8c-12.1 0-23.2 6.8-28.6 17.7zM416 128H32L53.2 467c1.6 25.3 22.6 45 47.9 45H346.9c25.3 0 46.3-19.7 47.9-45L416 128z" /></svg>
                <span class="btn-label max-md:hidden">Clear</span>
            </button>
            <button id="print-button" class="btn btn-primary" onclick={() => window.print()} title="Print. In the dialog choose the label printer + its media, Scale 100%, Margins None.">
                <svg class="size-[1.05em] shrink-0 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true"><path d="M448 192H64C28.65 192 0 220.7 0 256v96c0 17.67 14.33 32 32 32h32v96c0 17.67 14.33 32 32 32h320c17.67 0 32-14.33 32-32v-96h32c17.67 0 32-14.33 32-32V256C512 220.7 483.3 192 448 192zM384 448H128v-96h256V448zM432 296c-13.25 0-24-10.75-24-24c0-13.27 10.75-24 24-24s24 10.73 24 24C456 285.3 445.3 296 432 296zM128 64h229.5L384 90.51V160h64V77.25c0-8.484-3.375-16.62-9.375-22.62l-45.25-45.25C387.4 3.375 379.2 0 370.8 0H96C78.34 0 64 14.33 64 32v128h64V64z" /></svg>
                <span class="btn-label max-md:hidden">Print</span>
            </button>
        </div>
    </div>

    <!-- Tier 2: create bar -->
    <div class="flex min-w-0 flex-wrap items-center gap-2 max-sm:flex-col max-sm:items-stretch">
        <input type="text" id="labelText" class="min-w-0 flex-[1_1_16rem] max-w-[30rem] max-sm:flex-[1_1_100%] max-sm:max-w-none" placeholder="New label text" aria-label="Label text" bind:value={text} onkeypress={onEnter} />
        <input type="number" id="labelQuantity" class="w-[4.5rem]" placeholder="Qty" aria-label="Quantity" min="1" max="100" bind:value={quantity} onkeypress={onEnter} />
        <input type="button" class="btn btn-primary" value="Add" onclick={add} />
        <input type="button" class="btn" id="addImage" value="Add image" onclick={() => imageInput.click()} />
    </div>

    <!-- Tier 3: layout settings — inline on desktop, popover on mobile -->
    <div class="relative border-t border-ink/15 pt-[0.55rem] md:border-t-0 md:pt-0" bind:this={setupEl}>
        <button
            type="button"
            class="btn md:hidden max-sm:w-full"
            aria-haspopup="dialog"
            aria-expanded={setupOpen}
            onclick={() => (setupOpen = !setupOpen)}
        >
            Label setup <span class="up-readout font-normal normal-case tracking-normal text-purple"><span class="inline-block min-w-[2ch] text-right tabular-nums">{store.divisions}</span> up</span>
            <span class="text-[0.7em]" aria-hidden="true">▾</span>
        </button>
        <div
            class="{setupOpen ? 'flex' : 'hidden'} md:flex
                   absolute right-0 top-[calc(100%+6px)] z-[25] w-[min(24rem,calc(100vw-2rem))]
                   max-h-[min(28rem,calc(100vh-7rem))] flex-col gap-[0.85rem] overflow-y-auto rounded-lg
                   border-2 border-ink bg-paper p-4 shadow-popover
                   md:static md:z-auto md:w-auto md:max-h-none md:flex-row md:flex-wrap md:items-end
                   md:gap-x-5 md:gap-y-3 md:overflow-visible md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none"
            role="group"
            aria-label="Label setup"
        >
            {@render settingsFields()}
        </div>
    </div>

    <input type="file" bind:this={imageInput} accept="image/*" hidden onchange={onPickNewImage} />
</header>

{#if showTip}
    <div id="print-tip" class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b-2 border-ink bg-amber px-5 py-[0.6rem] text-[0.85rem] leading-snug text-ink" role="note">
        <span><strong>Printing on a label printer?</strong> Set Page / media to match your stock, then in the print dialog pick the printer + its label media, set <strong>Scale = 100%</strong> and <strong>Margins = None</strong> so labels print at true size.</span>
        <button type="button" class="btn ml-auto whitespace-nowrap" onclick={dismissTip}>Got it</button>
    </div>
{/if}
