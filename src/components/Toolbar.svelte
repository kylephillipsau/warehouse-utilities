<script>
    import { store, addLabels, addImageLabel, clearAllLabels } from '../lib/store.svelte.js';
    import { serializeLabels, openLabelFile } from '../lib/serialize.js';
    import { downloadBlob } from '../lib/output.js';
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
    function clearAll() { clearAllLabels(); }

    // Backup / restore of the whole library in one file. Same format the Save
    // label file output writes and the Import drawer opens (serialize.js), so a
    // backup is just a label file: labels, presets, and the sheet setup.
    let backupInput;
    const nothingToExport = $derived(store.labels.length === 0 && store.presets.length === 0);

    function exportAll() {
        menuOpen = false;
        const stamp = new Date().toLocaleDateString('en-CA');   // local YYYY-MM-DD
        downloadBlob(
            new Blob([JSON.stringify(serializeLabels(), null, 2)], { type: 'application/json' }),
            `labels-${stamp}.json`,
        );
    }

    function importAll() {
        menuOpen = false;
        backupInput.click();
    }

    function onPickBackup(event) {
        const file = event.target.files[0];
        event.target.value = '';   // so the same file can be picked again
        if (!file) { return; }
        file.text().then((text) => {
            let data;
            try { data = JSON.parse(text); }
            catch (e) { window.alert("That .json file couldn't be read."); return; }
            const res = openLabelFile(data, {
                confirmReplace: () => window.confirm('Opening this file will replace your current labels. Continue?'),
            });
            if (!res.ok && res.error) { window.alert(res.error); }
        }).catch(() => window.alert("That file couldn't be read."));
    }

    let scrolled = $state(false);
    function onScroll() { scrolled = window.scrollY > 0; }
</script>

<svelte:window onscroll={onScroll} />

<header
    id="header"
    class="sticky top-0 z-10 flex flex-col gap-[0.55rem] bg-paper text-ink border-b-[3px] border-ink px-4 py-[0.55rem] transition-shadow"
    style:box-shadow={scrolled ? 'var(--shadow-popover)' : 'none'}
>
    <!-- Row 1: brand + drawer toggles + overflow -->
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-[0.5rem] max-md:gap-x-3">
        <h1 id="heading" class="m-0 whitespace-nowrap rounded bg-ink px-[0.8rem] pt-[0.4rem] pb-[0.3rem] text-[0.9rem] font-bold uppercase tracking-[0.12em] text-paper max-md:px-[0.6rem] max-md:text-[0.78rem] max-md:tracking-[0.08em]">Label Maker</h1>

        <!-- Words, not icons, on a phone: a bare star and an arrow had to be
             guessed at, and the arrow read as upload as easily as import. -->
        <div class="flex flex-wrap items-center gap-2">
            <button id="presets-button" class="btn max-md:px-[0.7rem]" class:btn-active={ui.presetsOpen} aria-pressed={ui.presetsOpen} onclick={togglePresets} title="Preset labels">
                <svg class="size-[1.05em] shrink-0 fill-current max-md:hidden" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" aria-hidden="true"><path d="M316.9 18C311.6 7 300.4 0 288.1 0s-23.6 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L470.2 329 574.3 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L413 150.3 316.9 18z" /></svg>
                <span class="btn-label">Presets</span>
            </button>
            <button id="import-button" class="btn max-md:px-[0.7rem]" class:btn-active={ui.importOpen} aria-pressed={ui.importOpen} onclick={toggleImport} title="Import a list or label file">
                <svg class="size-[1.05em] shrink-0 fill-current max-md:hidden" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true"><path d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32V274.7l-73.4-73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l128-128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L288 274.7V32zM64 352c-35.3 0-64 28.7-64 64v32c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V416c0-35.3-28.7-64-64-64H346.5l-45.3 45.3c-25 25-65.5 25-90.5 0L165.5 352H64zm368 56a24 24 0 1 1 0 48 24 24 0 1 1 0-48z" transform="rotate(180 256 256)" /></svg>
                <span class="btn-label">Import</span>
            </button>

            <!-- On a phone Clear lives in the ⋯ menu instead: an icon-only bin in
                 the everyday row is one mistaken tap from wiping the sheet. -->
            <button type="button" id="clear-all" class="btn text-orange max-md:hidden" disabled={store.labels.length === 0} onclick={clearAll} title="Clear all labels">
                <svg class="size-[1.05em] shrink-0 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" aria-hidden="true"><path d="M135.2 17.7L128 32H32C14.3 32 0 46.3 0 64S14.3 96 32 96H416c17.7 0 32-14.3 32-32s-14.3-32-32-32H320l-7.2-14.3C307.4 6.8 296.3 0 284.2 0H163.8c-12.1 0-23.2 6.8-28.6 17.7zM416 128H32L53.2 467c1.6 25.3 22.6 45 47.9 45H346.9c25.3 0 46.3-19.7 47.9-45L416 128z" /></svg>
                <span class="btn-label">Clear</span>
            </button>

            <div class="relative" bind:this={menuEl}>
                <button type="button" class="btn max-md:px-[0.7rem]" aria-haspopup="menu" aria-expanded={menuOpen} aria-label="More options" title="More" onclick={() => (menuOpen = !menuOpen)}>
                    <span aria-hidden="true" class="text-[1.1em] leading-none">⋯</span>
                </button>
                {#if menuOpen}
                    <div class="absolute right-0 top-[calc(100%+6px)] z-[25] w-max min-w-[12rem] rounded-lg border-2 border-ink bg-paper p-1 shadow-popover" role="menu">
                        <button type="button" role="menuitem" class="block whitespace-nowrap rounded px-3 py-2 text-[0.9rem] text-ink no-underline hover:bg-ink/[0.08] w-full text-left disabled:opacity-40" disabled={nothingToExport} onclick={exportAll}>Export labels &amp; presets</button>
                        <button type="button" role="menuitem" class="block whitespace-nowrap rounded px-3 py-2 text-[0.9rem] text-ink no-underline hover:bg-ink/[0.08] w-full text-left" onclick={importAll}>Import labels &amp; presets&hellip;</button>
                        <div class="my-1 border-t-2 border-ink/15" role="separator"></div>
                        <button type="button" role="menuitem" class="block whitespace-nowrap rounded px-3 py-2 text-[0.9rem] font-bold text-orange no-underline hover:bg-ink/[0.08] w-full text-left disabled:opacity-40 md:hidden" disabled={store.labels.length === 0} onclick={() => { menuOpen = false; clearAll(); }}>Clear all labels</button>
                        <div class="my-1 border-t-2 border-ink/15 md:hidden" role="separator"></div>
                        <a role="menuitem" href="/index.html" class="block whitespace-nowrap rounded px-3 py-2 text-[0.9rem] text-ink no-underline hover:bg-ink/[0.08]">Home</a>
                        <a role="menuitem" href="https://github.com/kylephillipsau/warehouse-utilities" class="block whitespace-nowrap rounded px-3 py-2 text-[0.9rem] text-ink no-underline hover:bg-ink/[0.08]">Source code</a>
                        <a role="menuitem" href="/old/labels.html" class="block whitespace-nowrap rounded px-3 py-2 text-[0.9rem] text-ink no-underline hover:bg-ink/[0.08]">Old version (v1)</a>
                    </div>
                {/if}
            </div>

        </div>
    </div>

    <!-- Row 2: create bar. One line down to phone width: the text input takes
         whatever the qty and buttons leave, and Add image is icon-only there. -->
    <div class="flex min-w-0 items-center gap-2">
        <input type="text" id="labelText" class="min-w-0 flex-1" placeholder="New label text" aria-label="Label text" bind:value={text} onkeypress={onEnter} />
        <input type="number" id="labelQuantity" class="w-[3.75rem] shrink-0 md:w-[4.5rem]" placeholder="Qty" aria-label="Quantity" min="1" max="100" bind:value={quantity} onkeypress={onEnter} />
        <input type="button" class="btn shrink-0 btn-primary" value="Add" onclick={add} />
        <button type="button" class="btn shrink-0" id="addImage" aria-label="Add image" title="Add image" onclick={() => imageInput.click()}>
            <svg class="size-[1.05em] shrink-0 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true"><path d="M448 80c8.8 0 16 7.2 16 16V415.8l-5-6.5-136-176c-4.5-5.9-11.6-9.3-19-9.3s-14.4 3.4-19 9.3L202 340.7l-30.5-42.7C167 291.7 159.8 288 152 288s-15 3.7-19.5 10.1l-80 112L48 416.3l0-.3V96c0-8.8 7.2-16 16-16H448zM64 32C28.7 32 0 60.7 0 96V416c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V96c0-35.3-28.7-64-64-64H64zm80 192a48 48 0 1 0 0-96 48 48 0 1 0 0 96z" /></svg>
            <span class="btn-label max-md:hidden">Add image</span>
        </button>
    </div>

    <!-- Phone only: Setup & print floats at the bottom, within thumb reach and
         out of the header, which it used to push onto a third row. Hidden, not
         unmounted, while the panel it opens is showing: the panel returns focus
         to this same element when it closes. Also hidden while a left drawer
         is open, where it would sit over the drawer's content. -->
    <button type="button" id="inspector-toggle" class="btn btn-primary fixed right-4 bottom-4 z-20 px-4 py-[0.7rem] shadow-popover md:hidden" class:hidden={ui.inspectorOpen || ui.presetsOpen || ui.importOpen} aria-expanded={ui.inspectorOpen} aria-controls="inspector-panel" onclick={toggleInspector}>
        <svg class="size-[1.05em] shrink-0 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true"><path d="M448 192H64C28.65 192 0 220.7 0 256v96c0 17.67 14.33 32 32 32h32v96c0 17.67 14.33 32 32 32h320c17.67 0 32-14.33 32-32v-96h32c17.67 0 32-14.33 32-32V256C512 220.7 483.3 192 448 192zM384 448H128v-96h256V448zM432 296c-13.25 0-24-10.75-24-24c0-13.27 10.75-24 24-24s24 10.73 24 24C456 285.3 445.3 296 432 296zM128 64h229.5L384 90.51V160h64V77.25c0-8.484-3.375-16.62-9.375-22.62l-45.25-45.25C387.4 3.375 379.2 0 370.8 0H96C78.34 0 64 14.33 64 32v128h64V64z" /></svg>
        <span class="btn-label">Setup &amp; print</span>
    </button>

    <input type="file" bind:this={imageInput} accept="image/*" hidden onchange={onPickNewImage} />
    <input type="file" bind:this={backupInput} accept=".json,application/json" hidden onchange={onPickBackup} />
</header>
