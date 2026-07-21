<script>
    import { store, addLabels, addImageLabel, clearAllLabels } from '../lib/store.svelte.js';
    import { fileToLabelImage } from '../lib/image.js';
    import { ui, toggleInspector } from '../lib/ui.svelte.js';

    // The two side drawers toggle from their toolbar buttons (and stay visibly
    // active while their panel is open).
    function toggleImport() { ui.presetsOpen = false; ui.importOpen = !ui.importOpen; }
    function togglePresets() { ui.importOpen = false; ui.presetsOpen = !ui.presetsOpen; }

    let text = $state('');
    let quantity = $state('');
    let imageInput;

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

    // Overflow menu (Clear + nav links) — low-frequency actions kept out of the
    // primary flow. Closes on outside click / Escape.
    let menuOpen = $state(false);
    let menuEl;
    $effect(() => {
        if (!menuOpen) { return; }
        const onDoc = (e) => { if (menuEl && !menuEl.contains(e.target)) { menuOpen = false; } };
        const onKey = (e) => { if (e.key === 'Escape') { menuOpen = false; } };
        document.addEventListener('pointerdown', onDoc, true);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onDoc, true);
            document.removeEventListener('keydown', onKey);
        };
    });
    function clearAll() { clearAllLabels(); menuOpen = false; }

    let scrolled = $state(false);
    function onScroll() { scrolled = window.scrollY > 0; }
</script>

<svelte:window onscroll={onScroll} />

<header
    id="header"
    class="sticky top-0 z-10 flex flex-col gap-[0.55rem] bg-paper text-ink border-b-[3px] border-ink px-4 py-[0.55rem] transition-shadow"
    style:box-shadow={scrolled ? 'var(--shadow-popover)' : 'none'}
>
    <!-- Row 1: brand + drawer toggles + overflow + mobile inspector toggle -->
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-[0.5rem]">
        <h1 id="heading" class="m-0 whitespace-nowrap rounded bg-ink px-[0.8rem] pt-[0.4rem] pb-[0.3rem] text-[0.9rem] font-bold uppercase tracking-[0.12em] text-paper">Label Maker</h1>

        <div class="flex flex-wrap items-center gap-2">
            <button id="presets-button" class="btn" class:btn-active={ui.presetsOpen} aria-pressed={ui.presetsOpen} onclick={togglePresets} title="Preset labels">
                <svg class="size-[1.05em] shrink-0 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" aria-hidden="true"><path d="M316.9 18C311.6 7 300.4 0 288.1 0s-23.6 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L470.2 329 574.3 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L413 150.3 316.9 18z" /></svg>
                <span class="btn-label max-md:hidden">Presets</span>
            </button>
            <button id="import-button" class="btn" class:btn-active={ui.importOpen} aria-pressed={ui.importOpen} onclick={toggleImport} title="Import a list or label file">
                <svg class="size-[1.05em] shrink-0 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true"><path d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32V274.7l-73.4-73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l128-128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L288 274.7V32zM64 352c-35.3 0-64 28.7-64 64v32c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V416c0-35.3-28.7-64-64-64H346.5l-45.3 45.3c-25 25-65.5 25-90.5 0L165.5 352H64zm368 56a24 24 0 1 1 0 48 24 24 0 1 1 0-48z" transform="rotate(180 256 256)" /></svg>
                <span class="btn-label max-md:hidden">Import</span>
            </button>

            <div class="relative" bind:this={menuEl}>
                <button type="button" class="btn" aria-haspopup="menu" aria-expanded={menuOpen} aria-label="More options" title="More" onclick={() => (menuOpen = !menuOpen)}>
                    <span aria-hidden="true" class="text-[1.1em] leading-none">⋯</span>
                </button>
                {#if menuOpen}
                    <div class="absolute right-0 top-[calc(100%+6px)] z-[25] w-max min-w-[12rem] rounded-lg border-2 border-ink bg-paper p-1 shadow-popover" role="menu">
                        <button type="button" role="menuitem" class="block w-full whitespace-nowrap rounded px-3 py-2 text-left text-[0.9rem] font-bold text-orange hover:bg-ink/[0.08] disabled:opacity-45 disabled:pointer-events-none" disabled={store.labels.length === 0} onclick={clearAll}>Clear all labels</button>
                        <div class="my-1 border-t border-ink/15"></div>
                        <a role="menuitem" href="/index.html" class="block whitespace-nowrap rounded px-3 py-2 text-[0.9rem] text-ink no-underline hover:bg-ink/[0.08]">Home</a>
                        <a role="menuitem" href="https://github.com/kylephillipsau/warehouse-utilities" class="block whitespace-nowrap rounded px-3 py-2 text-[0.9rem] text-ink no-underline hover:bg-ink/[0.08]">Source code</a>
                        <a role="menuitem" href="/old/labels.html" class="block whitespace-nowrap rounded px-3 py-2 text-[0.9rem] text-ink no-underline hover:bg-ink/[0.08]">Old version (v1)</a>
                    </div>
                {/if}
            </div>

            <button type="button" id="inspector-toggle" class="btn btn-primary md:hidden" aria-expanded={ui.inspectorOpen} aria-controls="inspector-panel" onclick={toggleInspector} title="Setup & print">
                <svg class="size-[1.05em] shrink-0 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true"><path d="M448 192H64C28.65 192 0 220.7 0 256v96c0 17.67 14.33 32 32 32h32v96c0 17.67 14.33 32 32 32h320c17.67 0 32-14.33 32-32v-96h32c17.67 0 32-14.33 32-32V256C512 220.7 483.3 192 448 192zM384 448H128v-96h256V448zM432 296c-13.25 0-24-10.75-24-24c0-13.27 10.75-24 24-24s24 10.73 24 24C456 285.3 445.3 296 432 296zM128 64h229.5L384 90.51V160h64V77.25c0-8.484-3.375-16.62-9.375-22.62l-45.25-45.25C387.4 3.375 379.2 0 370.8 0H96C78.34 0 64 14.33 64 32v128h64V64z" /></svg>
                <span class="btn-label">Setup &amp; print</span>
            </button>
        </div>
    </div>

    <!-- Row 2: create bar — a wrapping row: the text input grows to fill the line,
         the qty + buttons wrap beneath it on narrow screens. -->
    <div class="flex min-w-0 flex-wrap items-center gap-2">
        <input type="text" id="labelText" class="min-w-0 flex-[1_1_14rem]" placeholder="New label text" aria-label="Label text" bind:value={text} onkeypress={onEnter} />
        <input type="number" id="labelQuantity" class="w-[4.5rem] shrink-0" placeholder="Qty" aria-label="Quantity" min="1" max="100" bind:value={quantity} onkeypress={onEnter} />
        <input type="button" class="btn shrink-0 btn-primary" value="Add" onclick={add} />
        <input type="button" class="btn shrink-0" id="addImage" value="Add image" onclick={() => imageInput.click()} />
    </div>

    <input type="file" bind:this={imageInput} accept="image/*" hidden onchange={onPickNewImage} />
</header>
