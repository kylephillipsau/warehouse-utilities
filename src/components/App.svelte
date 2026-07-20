<script>
    import { store, persistSize } from '../lib/store.svelte.js';
    import { applySize, orientedPage } from '../lib/size.js';
    import Toolbar from './Toolbar.svelte';
    import LabelList from './LabelList.svelte';
    import UndoToast from './UndoToast.svelte';
    import ImportDrawer from './ImportDrawer.svelte';
    import ExportDialog from './ExportDialog.svelte';
    import AdjustDialog from './AdjustDialog.svelte';
    import PresetsDrawer from './PresetsDrawer.svelte';

    // Push the resolved page + label sizes into root CSS vars and persist them
    $effect(() => {
        applySize(store.page, store.divisions, store.orientation);
        persistSize();
    });

    // Make the printed page EXACTLY the physical media so a label printer maps
    // it 1:1 (no scale-to-fit) — kept in a raw <style> element.
    let pageStyleEl;
    $effect(() => {
        if (!pageStyleEl) {
            pageStyleEl = document.createElement('style');
            document.head.appendChild(pageStyleEl);
        }
        const p = orientedPage(store.page, store.orientation);
        pageStyleEl.textContent = `@page { size: ${p.width}mm ${p.height}mm; margin: 0; }`;
    });
</script>

<Toolbar />
<LabelList />
<UndoToast />
<ImportDrawer />
<ExportDialog />
<AdjustDialog />
<PresetsDrawer />
