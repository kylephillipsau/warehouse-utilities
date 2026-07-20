// Which dialog is open. Kept out of components so any surface (a label's mini
// toolbar, the toolbar buttons) can open a dialog without prop-drilling.
export const ui = $state({
    adjustTargetId: null,   // label id being adjusted, or null
    presetsOpen: false,
    presetsEditId: null,    // preset to start inline-renaming when Presets opens
    importOpen: false,
    exportOpen: false,
});

export const openAdjust = (id) => { ui.adjustTargetId = id; };
export const closeAdjust = () => { ui.adjustTargetId = null; };
// The two left drawers are mutually exclusive — opening one closes the other.
// openPresets may name a preset to begin renaming inline (e.g. just-saved).
export const openPresets = (editId = null) => { ui.importOpen = false; ui.presetsOpen = true; ui.presetsEditId = editId; };
export const openImport = () => { ui.presetsOpen = false; ui.importOpen = true; };
export const openExport = () => { ui.exportOpen = true; };
