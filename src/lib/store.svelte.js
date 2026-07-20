// Single source of truth for the label maker. Every surface — the list, the
// mini toolbars, the Adjust dialog, the preset library, import/export — reads
// and writes this one reactive store, so there is no manual cross-surface sync.
import { normalizeAdjust } from './adjust.js';
import { loadPresets, savePresets, loadPage, savePage, loadDivisions, saveDivisions, newId } from './persistence.js';
import { DEFAULT_PAGE, DEFAULT_DIVISIONS, clampDivisions } from './size.js';

function initialSpec(saved, fallback) {
    return {
        preset: saved && saved.preset ? saved.preset : fallback.preset,
        width: saved && saved.width ? saved.width : '',
        height: saved && saved.height ? saved.height : '',
        unit: saved && saved.unit ? saved.unit : 'mm',
    };
}

export const store = $state({
    labels: [],
    presets: loadPresets(),
    page: initialSpec(loadPage(), DEFAULT_PAGE),    // physical media / page size
    divisions: loadDivisions() ? clampDivisions(loadDivisions()) : DEFAULT_DIVISIONS,
    orientation: 'landscape',
});

// A transient stack of deleted labels for the undo toast
export const undo = $state({ items: [] });

export function makeLabel(text = '', image = null, adjust) {
    return { id: newId(), text, image: image || null, adjust: normalizeAdjust(adjust) };
}

export function addLabels(text, quantity) {
    let qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < 1) { qty = 1; }
    if (qty > 100) { qty = 100; }
    for (let i = 0; i < qty; i++) { store.labels.push(makeLabel(text)); }
}

export function addImageLabel(src) {
    store.labels.push(makeLabel('', src));
}

export function importLines(lines) {
    lines.forEach((line) => store.labels.push(makeLabel(line)));
}

function indexOf(id) {
    return store.labels.findIndex((l) => l.id === id);
}

export function duplicateLabel(id) {
    const i = indexOf(id);
    if (i === -1) { return; }
    const l = store.labels[i];
    store.labels.splice(i + 1, 0, makeLabel(l.text, l.image, l.adjust));
}

export function deleteLabel(id) {
    const i = indexOf(id);
    if (i === -1) { return; }
    const [removed] = store.labels.splice(i, 1);
    undo.items.push({ label: removed, index: i });
}

export function undoDelete() {
    const last = undo.items.pop();
    if (!last) { return; }
    const at = Math.min(last.index, store.labels.length);
    store.labels.splice(at, 0, last.label);
}

export function clearUndo() {
    undo.items = [];
}

// Prune a label that has become empty (no text, no image) - mirrors the old
// updateLabels() behaviour, but never removes an image-only label.
export function pruneIfEmpty(id) {
    const i = indexOf(id);
    if (i === -1) { return; }
    const l = store.labels[i];
    if ((!l.text || l.text.trim().length === 0) && !l.image) {
        store.labels.splice(i, 1);
    }
}

export function setImage(id, src) {
    const l = store.labels[indexOf(id)];
    if (l) { l.image = src; }
}

export function removeImage(id) {
    const l = store.labels[indexOf(id)];
    if (l) { l.image = null; }
}

export function setAdjust(id, adjust) {
    const l = store.labels[indexOf(id)];
    if (l) { l.adjust = normalizeAdjust(adjust); }
}

// Merge a partial change into a label's adjust (used by inline pan/resize)
export function patchAdjust(id, partial) {
    const l = store.labels[indexOf(id)];
    if (l) { l.adjust = normalizeAdjust({ ...l.adjust, ...partial }); }
}

export function moveLabel(id, toIndex) {
    const from = indexOf(id);
    if (from === -1) { return; }
    const clamped = Math.min(Math.max(toIndex, 0), store.labels.length - 1);
    if (clamped === from) { return; }
    const [l] = store.labels.splice(from, 1);
    store.labels.splice(clamped, 0, l);
}

// ---- Size & orientation ----

export function persistSize() {
    savePage({ preset: store.page.preset, width: store.page.width, height: store.page.height, unit: store.page.unit });
    saveDivisions(store.divisions);
}

// ---- Preset library ----

function persistPresets() {
    savePresets(store.presets);
}

export function savePresetFromLabel(id, name) {
    const l = store.labels[indexOf(id)];
    if (!l) { return null; }
    const finalName = (name || '').trim() || (l.text || '').trim() || 'Label preset';
    store.presets.push({
        id: newId(),
        name: finalName,
        text: l.text,
        image: l.image,
        adjust: normalizeAdjust(l.adjust),
    });
    persistPresets();
    return finalName;
}

// Insert a preset as a new label. With no index (or an out-of-range one) it
// appends; dragging a preset onto the sheet passes the drop position so the new
// label lands where it was dropped.
export function insertPreset(presetId, index) {
    const p = store.presets.find((x) => String(x.id) === String(presetId));
    if (!p) { return; }
    const label = makeLabel(p.text || '', p.image || null, p.adjust);
    if (typeof index === 'number' && index >= 0 && index <= store.labels.length) {
        store.labels.splice(index, 0, label);
    } else {
        store.labels.push(label);
    }
}

export function renamePreset(presetId, name) {
    const p = store.presets.find((x) => String(x.id) === String(presetId));
    if (!p) { return; }
    p.name = (name || '').trim() || p.name;
    persistPresets();
}

export function deletePreset(presetId) {
    store.presets = store.presets.filter((x) => String(x.id) !== String(presetId));
    persistPresets();
}

export function mergePresets(incoming) {
    if (!Array.isArray(incoming)) { return; }
    const seen = new Set(store.presets.map((p) => String(p.id)));
    incoming.forEach((p) => {
        if (p && !seen.has(String(p.id))) { store.presets.push(p); seen.add(String(p.id)); }
    });
    persistPresets();
}

export function labelsHaveImages() {
    return store.labels.some((l) => l.image);
}
