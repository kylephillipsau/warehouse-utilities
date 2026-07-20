// Which dialog is open. Kept out of components so any surface (a label's mini
// toolbar, the toolbar buttons) can open a dialog without prop-drilling.
export const ui = $state({
    adjustTargetId: null,   // label id being adjusted, or null
    presetsOpen: false,
    importOpen: false,
    exportOpen: false,
});

export const openAdjust = (id) => { ui.adjustTargetId = id; };
export const closeAdjust = () => { ui.adjustTargetId = null; };
export const openPresets = () => { ui.presetsOpen = true; };
export const openImport = () => { ui.importOpen = true; };
export const openExport = () => { ui.exportOpen = true; };
