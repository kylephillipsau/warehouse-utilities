// Save/load the full label set as a self-contained JSON file (schema v2): images
// embedded as base64 data URIs, plus per-label adjust, size, orientation, and
// the preset library so presets travel between devices. Still opens v1 files.
import { normalizeAdjust } from './adjust.js';
import { clampDivisions, clampSpacing } from './size.js';
import { store, makeLabel, mergePresets } from './store.svelte.js';

export const LABEL_FILE_FORMAT = 'warehouse-utilities-labels';
export const LABEL_FILE_VERSION = 2;

export function serializeLabels() {
    return {
        format: LABEL_FILE_FORMAT,
        version: LABEL_FILE_VERSION,
        page: { preset: store.page.preset, width: store.page.width, height: store.page.height, unit: store.page.unit },
        divisions: store.divisions,
        margin: store.margin,
        gap: store.gap,
        labels: store.labels.map((l) => ({
            text: l.text,
            image: l.image || null,
            adjust: normalizeAdjust(l.adjust),
        })),
        presets: store.presets,
    };
}

// Returns { ok, error }. Replaces the current labels (like opening a document)
// and restores size + orientation; merges any bundled presets. Text is applied
// as plain strings, never HTML.
export function openLabelFile(data, { confirmReplace } = {}) {
    if (!data || data.format !== LABEL_FILE_FORMAT || !Array.isArray(data.labels)) {
        return { ok: false, error: "That JSON file isn't a label file this app recognises." };
    }
    if (store.labels.length > 0 && confirmReplace && !confirmReplace()) {
        return { ok: false, error: null };
    }
    store.labels = data.labels.map((entry) =>
        makeLabel(
            entry && typeof entry.text === 'string' ? entry.text : '',
            entry && entry.image ? entry.image : null,
            entry && entry.adjust,
        ),
    );
    if (data.presets) { mergePresets(data.presets); }
    if (data.page) {
        if (data.page.preset) { store.page.preset = data.page.preset; }
        if (data.page.width) { store.page.width = data.page.width; }
        if (data.page.height) { store.page.height = data.page.height; }
        if (data.page.unit) { store.page.unit = data.page.unit; }
    }
    if (data.divisions) { store.divisions = clampDivisions(data.divisions); }
    if (data.margin != null) { store.margin = clampSpacing(data.margin); }
    if (data.gap != null) { store.gap = clampSpacing(data.gap); }
    return { ok: true, error: null };
}

export function exportTextLines() {
    return store.labels
        .map((l) => l.text)
        .filter((t) => t && t.trim().length > 0);
}
