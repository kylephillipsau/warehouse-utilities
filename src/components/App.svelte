<script>
    import { onMount } from 'svelte';
    import { store, hydrateStore } from '../lib/store.svelte.js';
    import { loadAll, persistState } from '../lib/persistence.js';
    import { applySize, resolveDesign } from '../lib/size.js';
    import Toolbar from './Toolbar.svelte';
    import LabelList from './LabelList.svelte';
    import UndoToast from './UndoToast.svelte';
    import ImportDrawer from './ImportDrawer.svelte';
    import InspectorPanel from './InspectorPanel.svelte';
    import AdjustDialog from './AdjustDialog.svelte';
    import PresetsDrawer from './PresetsDrawer.svelte';

    // Hydrate the store from IndexedDB once on mount; only then start autosaving,
    // so the initial empty defaults don't overwrite persisted work.
    let ready = $state(false);
    onMount(async () => {
        hydrateStore(await loadAll());
        ready = true;
    });

    // Push the resolved page + label sizes into root CSS vars
    $effect(() => {
        applySize(store.page, store.divisions, store.margin, store.gap, store.orientation);
    });

    // Toggle the label border / cut guide (screen). ZPL handles it separately.
    $effect(() => {
        document.documentElement.style.setProperty('--label-border-w', store.showBorders ? '2px' : '0');
    });

    // Make the printed page EXACTLY the physical media (native width × height, no
    // orientation swap) so a label printer maps it 1:1 with no scale-to-fit and
    // no browser auto-rotation — kept in a raw <style> element.
    let pageStyleEl;
    $effect(() => {
        if (!pageStyleEl) {
            pageStyleEl = document.createElement('style');
            document.head.appendChild(pageStyleEl);
        }
        // Browser print gets the DESIGN size (so landscape prints landscape on a
        // sheet printer). ZPL ignores @page and rotates onto the native media.
        const p = resolveDesign(store.page, store.orientation);
        pageStyleEl.textContent = `@page { size: ${p.width}mm ${p.height}mm; margin: 0; }`;
    });

    // Autosave everything to IndexedDB. Reading the fields below (refs/strings,
    // no cloning) establishes deep reactive deps cheaply; the actual write is
    // debounced and snapshots once per save.
    let saveTimer;
    $effect(() => {
        void store.labels.length;
        store.labels.forEach((l) => { void l.text; void l.image; void l.adjust; });
        void store.presets.length;
        store.presets.forEach((p) => { void p.name; void p.text; void p.image; void p.adjust; });
        void store.page.preset; void store.page.width; void store.page.height; void store.page.unit;
        void store.divisions; void store.margin; void store.gap; void store.orientation; void store.showBorders;
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
                orientation: store.orientation,
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
