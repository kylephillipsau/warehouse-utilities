// Single source of truth for the label maker. Every surface — the list, the
// mini toolbars, the Adjust dialog, the preset library, import/export — reads
// and writes this one reactive store, so there is no manual cross-surface sync.
import { normalizeAdjust } from './adjust.js';
import { newId } from './persistence.js';
import { DEFAULT_PAGE, DEFAULT_DIVISIONS, clampDivisions, clampCopies } from './size.js';
import { normalizeFields, cloneFields, makeField, normalizeField, labelIsEmpty } from './fields.js';
import { resolveTemplate } from './tokens.js';

export const store = $state({
    labels: [],
    presets: [],
    page: { preset: DEFAULT_PAGE.preset, width: '', height: '', unit: 'mm' },  // physical media / page size (native orientation)
    divisions: DEFAULT_DIVISIONS,
    margin: 0,   // page edge margin (mm) around the tiled labels
    gap: 0,      // gap (mm) between stacked label segments
    orientation: 'portrait',  // 'portrait' | 'landscape' — landscape rotates the design (see size.resolveDesign)
    showBorders: true,        // draw the label border / cut guide (screen + ZPL)
    output: { method: 'zebra', dpi: 203, saveFormat: 'json', copies: 1 },  // configurable print/output (see output.js)
});

// Populate the store from persisted state (see persistence.loadAll). Applied
// once after mount; anything absent keeps its default.
export function hydrateStore(data) {
    if (!data) { return; }
    if (Array.isArray(data.labels)) {
        store.labels = data.labels.map((l) => {
            const label = {
                id: (l && l.id) || newId(),
                text: l && typeof l.text === 'string' ? l.text : '',
                image: l && l.image ? l.image : null,
                adjust: normalizeAdjust(l && l.adjust),
            };
            const fields = normalizeFields(l && l.fields);
            if (fields.length) { label.fields = fields; }  // keep classic labels classic
            return label;
        });
    }
    if (Array.isArray(data.presets)) { store.presets = data.presets; }
    if (data.page && typeof data.page === 'object') {
        if (data.page.preset) { store.page.preset = data.page.preset; }
        store.page.width = data.page.width != null ? data.page.width : '';
        store.page.height = data.page.height != null ? data.page.height : '';
        store.page.unit = data.page.unit || 'mm';
    }
    if (data.divisions != null) { store.divisions = clampDivisions(data.divisions); }
    if (typeof data.margin === 'number' && data.margin >= 0) { store.margin = data.margin; }
    if (typeof data.gap === 'number' && data.gap >= 0) { store.gap = data.gap; }
    if (data.orientation === 'landscape' || data.orientation === 'portrait') { store.orientation = data.orientation; }
    if (typeof data.showBorders === 'boolean') { store.showBorders = data.showBorders; }
    if (data.output && typeof data.output === 'object') {
        // method validated lazily at render (getMethod falls back if unknown)
        if (typeof data.output.method === 'string') { store.output.method = data.output.method; }
        if (data.output.dpi === 203 || data.output.dpi === 300) { store.output.dpi = data.output.dpi; }
        if (data.output.saveFormat === 'txt' || data.output.saveFormat === 'json') { store.output.saveFormat = data.output.saveFormat; }
        if (data.output.copies != null) { store.output.copies = clampCopies(data.output.copies); }
    }
}

// A transient stack of deleted labels for the undo toast
export const undo = $state({ items: [] });

export function makeLabel(text = '', image = null, adjust, fields) {
    const l = { id: newId(), text, image: image || null, adjust: normalizeAdjust(adjust) };
    const nf = normalizeFields(fields);
    if (nf.length) { l.fields = nf; }   // only template labels carry `fields`
    return l;
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
    store.labels.splice(i + 1, 0, makeLabel(l.text, l.image, l.adjust, cloneFields(l.fields)));
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
    if (last.batch) { store.labels = [...last.batch, ...store.labels]; return; }
    const at = Math.min(last.index, store.labels.length);
    store.labels.splice(at, 0, last.label);
}

export function clearUndo() {
    undo.items = [];
}

// Clear the whole sheet in one deliberate action; recoverable via the undo toast
// (the cleared set is pushed as a single batch entry).
export function clearAllLabels() {
    if (store.labels.length === 0) { return; }
    const cleared = store.labels;
    store.labels = [];
    undo.items.push({ batch: cleared });
}

// Prune a label that has become empty (no text/fields, no image) - mirrors the
// old updateLabels() behaviour, but never removes an image-only label.
export function pruneIfEmpty(id) {
    const i = indexOf(id);
    if (i === -1) { return; }
    if (labelIsEmpty(store.labels[i])) {
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

// ---- Multi-field templates ----
// A label becomes a template when it carries a non-empty `fields` array. Removing
// the last field reverts it to a classic (empty) label, which then prunes.

// Turn a classic label into a template, seeding one field from its current text.
export function convertToTemplate(id) {
    const l = store.labels[indexOf(id)];
    if (!l || (l.fields && l.fields.length)) { return; }
    l.fields = [makeField({ value: l.text || '', size: 'm' })];
    l.text = '';   // so stale text can't resurface if all fields are later removed
}

// Turn a classic label into a single barcode, seeding the value from its text.
export function convertToBarcode(id) {
    const l = store.labels[indexOf(id)];
    if (!l || (l.fields && l.fields.length)) { return; }
    l.fields = [makeField({ value: l.text || '', size: 'l', type: 'barcode', symbology: 'code128' })];
    l.text = '';
}

export function addField(id, partial) {
    const l = store.labels[indexOf(id)];
    if (!l) { return; }
    if (!l.fields) { l.fields = []; }
    l.fields.push(makeField(partial));
}

export function removeField(id, fieldId) {
    const l = store.labels[indexOf(id)];
    if (!l || !l.fields) { return; }
    l.fields = l.fields.filter((f) => f.id !== fieldId);
    if (!l.fields.length) { delete l.fields; }  // back to a classic (empty) label
}

export function moveField(id, fieldId, dir) {
    const l = store.labels[indexOf(id)];
    if (!l || !l.fields) { return; }
    const i = l.fields.findIndex((f) => f.id === fieldId);
    const j = i + dir;
    if (i === -1 || j < 0 || j >= l.fields.length) { return; }
    const arr = l.fields;
    [arr[i], arr[j]] = [arr[j], arr[i]];
}

export function patchField(id, fieldId, partial) {
    const l = store.labels[indexOf(id)];
    if (!l || !l.fields) { return; }
    const i = l.fields.findIndex((f) => f.id === fieldId);
    if (i === -1) { return; }
    l.fields[i] = normalizeField({ ...l.fields[i], ...partial });
}

// ---- Preset library ----
// (persistence is reactive — see App.svelte — so mutations no longer save
// explicitly; every change to the store is autosaved to IndexedDB.)

export function savePresetFromLabel(id, name) {
    const l = store.labels[indexOf(id)];
    if (!l) { return null; }
    // Default name: explicit → first non-empty field/text (resolved) → fallback.
    const firstText = (l.fields && l.fields.length)
        ? (l.fields.map((f) => resolveTemplate(f.value).trim()).find(Boolean) || '')
        : (l.text || '');
    const finalName = (name || '').trim() || firstText.trim() || 'Label preset';
    const presetId = newId();
    const preset = {
        id: presetId,
        name: finalName,
        text: l.text,
        image: l.image,
        adjust: normalizeAdjust(l.adjust),
    };
    if (l.fields && l.fields.length) { preset.fields = normalizeFields(l.fields); }
    store.presets.push(preset);
    return presetId;
}

// Insert a preset as a new label. With no index (or an out-of-range one) it
// appends; dragging a preset onto the sheet passes the drop position so the new
// label lands where it was dropped.
export function insertPreset(presetId, index) {
    const p = store.presets.find((x) => String(x.id) === String(presetId));
    if (!p) { return; }
    const label = makeLabel(p.text || '', p.image || null, p.adjust, cloneFields(p.fields));
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
}

export function deletePreset(presetId) {
    store.presets = store.presets.filter((x) => String(x.id) !== String(presetId));
}

export function mergePresets(incoming) {
    if (!Array.isArray(incoming)) { return; }
    const seen = new Set(store.presets.map((p) => String(p.id)));
    incoming.forEach((p) => {
        if (p && !seen.has(String(p.id))) { store.presets.push(p); seen.add(String(p.id)); }
    });
}

export function labelsHaveImages() {
    return store.labels.some((l) => l.image);
}
