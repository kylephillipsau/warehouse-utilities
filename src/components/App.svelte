<script>
    import { onMount } from 'svelte';
    import { store, hydrateStore } from '../lib/store.svelte.js';
    import { autoConnectPrinter } from '../lib/printer.svelte.js';
    import { loadAll, persistState } from '../lib/persistence.js';
    import { applySize, resolvePage } from '../lib/size.js';
    import { isThermalMethod } from '../lib/output.js';
    import Toolbar from './Toolbar.svelte';
    import LabelList from './LabelList.svelte';
    import UndoToast from './UndoToast.svelte';
    import ImportDrawer from './ImportDrawer.svelte';
    import InspectorPanel from './InspectorPanel.svelte';
    import AdjustDialog from './AdjustDialog.svelte';
    import FieldsDialog from './FieldsDialog.svelte';
    import PresetsDrawer from './PresetsDrawer.svelte';

    // Hydrate the store from IndexedDB once on mount; only then start autosaving,
    // so the initial empty defaults don't overwrite persisted work.
    let ready = $state(false);
    onMount(async () => {
        hydrateStore(await loadAll());
        ready = true;
        // Returning Zebra users reconnect to Browser Print automatically, so the
        // remembered printer is ready without re-scanning. Fire-and-forget: it is
        // a background best-effort and silent if the service isn't up.
        autoConnectPrinter();
    });

    // Push the resolved page + label sizes into root CSS vars
    $effect(() => {
        applySize(store.page, store.divisions, store.margin, store.gap, store.rotation);
    });

    // The one invariant that keeps media orientation safe. A thermal head's width
    // is fixed hardware, so thermal stock has exactly one way to feed and media
    // orientation is not a choice there. Switching output to a label printer
    // therefore collapses it back to native — otherwise a landscape SHEET design
    // would silently emit a ^PW wider than the head and get clipped. Sheet output
    // keeps whatever the user set. The Inspector disables the control to match.
    $effect(() => {
        if (isThermalMethod(store.output.method) && store.page.orientation === 'landscape') {
            store.page.orientation = 'portrait';
        }
    });

    // Toggle the label border / cut guide (screen). ZPL handles it separately.
    $effect(() => {
        document.documentElement.style.setProperty('--label-border-w', store.showBorders ? '2px' : '0');
    });

    // Make the printed page EXACTLY the physical media so a label printer maps it
    // 1:1 with no scale-to-fit — kept in a raw <style> element. resolvePage
    // applies MEDIA orientation, which belongs here because it really is the page
    // (a landscape A4 is 297 × 210 and @page must say so). ARTWORK rotation does
    // not appear here at all: it turns content inside a label and never the page,
    // which is what stops thermal stock emitting a page wider than tall for
    // Chrome to auto-rotate. Thermal media orientation is pinned above.
    let pageStyleEl;
    $effect(() => {
        if (!pageStyleEl) {
            pageStyleEl = document.createElement('style');
            document.head.appendChild(pageStyleEl);
        }
        const p = resolvePage(store.page);
        pageStyleEl.textContent = `@page { size: ${p.width}mm ${p.height}mm; margin: 0; }`;
    });

    // Autosave everything to IndexedDB. Reading the fields below (refs/strings,
    // no cloning) establishes deep reactive deps cheaply; the actual write is
    // debounced and snapshots once per save.
    let saveTimer;
    $effect(() => {
        void store.labels.length;
        store.labels.forEach((l) => {
            void l.text; void l.image; void l.adjust; void l.fields;
            if (l.fields) { l.fields.forEach((f) => { void f.value; void f.size; void f.align; void f.bold; void f.type; void f.symbology; void f.hri; }); }
        });
        void store.presets.length;
        store.presets.forEach((p) => { void p.name; void p.text; void p.image; void p.adjust; void p.fields; });
        void store.page.preset; void store.page.width; void store.page.height; void store.page.unit; void store.page.orientation;
        void store.divisions; void store.margin; void store.gap; void store.rotation; void store.showBorders;
        void store.output.method; void store.output.dpi; void store.output.saveFormat;
        if (!ready) { return; }
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            persistState({
                labels: $state.snapshot(store.labels),
                presets: $state.snapshot(store.presets),
                page: $state.snapshot(store.page),
                divisions: store.divisions,
                margin: store.margin,
                gap: store.gap,
                rotation: store.rotation,
                showBorders: store.showBorders,
                output: $state.snapshot(store.output),
            });
        }, 500);
    });
</script>

<Toolbar />
<div class="workspace">
    <ImportDrawer />
    <PresetsDrawer />
    <LabelList />
    <InspectorPanel />
</div>
<UndoToast />
<AdjustDialog />
<FieldsDialog />
