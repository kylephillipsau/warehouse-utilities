<script>
    import { store, persistSize } from '../lib/store.svelte.js';
    import { applySize } from '../lib/size.js';
    import Toolbar from './Toolbar.svelte';
    import LabelList from './LabelList.svelte';
    import UndoToast from './UndoToast.svelte';
    import ImportDialog from './ImportDialog.svelte';
    import ExportDialog from './ExportDialog.svelte';
    import AdjustDialog from './AdjustDialog.svelte';
    import PresetsDialog from './PresetsDialog.svelte';

    // Push the chosen label size into root CSS vars and persist it
    $effect(() => {
        applySize(store.size);
        persistSize();
    });

    // Paper orientation for printing, kept in a raw <style> element
    let pageStyleEl;
    $effect(() => {
        if (!pageStyleEl) {
            pageStyleEl = document.createElement('style');
            document.head.appendChild(pageStyleEl);
        }
        pageStyleEl.textContent = `@page { size: ${store.orientation}; }`;
    });
</script>

<Toolbar />
<LabelList />
<UndoToast />
<ImportDialog />
<ExportDialog />
<AdjustDialog />
<PresetsDialog />
